import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ColorRepresentation,
  EventDispatcher,
  EventListener,
  Mesh,
  RawShaderMaterial,
  Texture,
  Vector2,
  Vector4,
} from "three";

import {
  AsepriteJSON,
  AsepriteJSONFrame,
  AsepriteJSONFrameTag,
  AsepriteJSONLayer,
} from "./aseprite-export-types";
import { createAspriteShaderMaterial } from "./aseprite-shader-material";

export * from "./aseprite-export-types";

// Interface type for vectors passed to the sprite.
export type IVector2 = {
  x: number;
  y: number;
};

// Parameters provided to FrameNameSpecifier.
export type FrameParams = {
  frame: number;
  layerName: string;
};

// Frames are referenced by name, but there's a freeform
// text field with formatting options in Aseprite that allows
// a variety of formats. Therefore, we expect the user to provide
// a function that maps FrameParams to the layer's filename.
export type FrameNameSpecifier = (frameParams: FrameParams) => string;

// We also support the inverse - resolving the layer and tag from the frame name.
// This comes in handy for complex sprites with a high number of empty frames/layer
// combinations.
export type InvertedFrameNameSpecifier = (
  frameName: string
) => Partial<FrameParams>;

// Options passed to the constructor for ThreeAseprite.
export type ThreeAsepriteOptions<LayerName> = {
  texture: Texture;
  sourceJSON: AsepriteJSON;
  frameName?: FrameNameSpecifier;
  frameNameToFrameParams?: InvertedFrameNameSpecifier;
  offset?: IVector2;
  layers?: LayerName[];
  layerDepth?: number;
};

// Internal bookkeeping for layer groups.
type LayerGrouping = {
  [key: string]: string[];
};

// Empty frame definition for internal use.
const emptyFrameDef: AsepriteJSONFrame = {
  frame: { x: 0, y: 0, w: 0, h: 0 },
  rotated: false,
  trimmed: true,
  spriteSourceSize: { x: 0, y: 0, w: 0, h: 0 },
  sourceSize: { w: 0, h: 0 },
  duration: 100,
};

export type LayerClipping = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

type FrameInfo = {
  duration: number;
  layerFrames: Record<string, AsepriteJSONFrame>;
};

type Trigger<EventNames> = {
  tagName: string | null;
  eventName: EventNames;
};

export type FrameTriggerEvent<EventNames> = {
  type: EventNames;
};

export const defaultLayerName = "Default";
export const defaultTagName = "Default";

export enum StandardEvents {
  animationComplete = "animationComplete",
  tagSwitched = "tagSwitched",
}

const ANIMATION_COMPLETE_EVENT = {
  type: StandardEvents.animationComplete,
} as const;

const TAG_SWITCHED_EVENT = {
  type: StandardEvents.tagSwitched,
} as const;

/**
 * Three.js aseprite sprite renderer class.
 */
export class ThreeAseprite<
  LayerNames extends string = string,
  EventNames extends string = string
> extends EventDispatcher<
  Record<
    EventNames | StandardEvents,
    FrameTriggerEvent<EventNames | StandardEvents>
  >
> {
  public mesh: Mesh;
  public texture: Texture;
  public playingAnimation: boolean = true;
  public playingAnimationBackwards: boolean = false;
  public readonly sourceJSON: AsepriteJSON;

  private frames: Record<number, FrameInfo> = {};
  private tags: Record<string, AsepriteJSONFrameTag> = {};
  private orderedLayers: string[];
  private layerGroups: LayerGrouping = {};
  private minFrame = 0;
  private maxFrame = 0;
  private currentFrame: number = 0;
  private currentFrameTime: number = 0;
  private currentTag: string | null = null;
  private currentTagFrame: number | null = null;
  private geometry: BufferGeometry;
  private material: RawShaderMaterial;
  private textureWidth: number;
  private textureHeight: number;
  private vtxIndex: Uint16Array;
  private vtxPos: Float32Array;
  private vtxUV: Float32Array;
  private vtxOpacity: Float32Array;
  private vtxColor: Float32Array;
  private vtxFade: Float32Array;
  private vtxOutlineSpread: Float32Array;
  private offset: Vector2 = new Vector2();
  private options: ThreeAsepriteOptions<LayerNames>;
  private clipping?: LayerClipping;
  private outlineSpread?: number;
  private triggers: Record<number, Trigger<EventNames>[]> = {};

  constructor(options: ThreeAsepriteOptions<LayerNames>) {
    super();

    // Preserve options to allow easy cloning later.
    this.options = options;
    this.sourceJSON = options.sourceJSON;
    if (options.offset) {
      this.offset.x = options.offset.x;
      this.offset.y = options.offset.y;
    }

    // Pick a z offset per layer so that higher layers are above lower layers.
    const layerDepth = options.layerDepth ?? 0.05;

    // Assign texture, size.
    this.texture = options.texture;

    // We assume that textures are loaded through Three.TextureLoaded
    // and contain references to images. Video textures not supported.
    this.textureWidth = this.texture.image.naturalWidth;
    this.textureHeight = this.texture.image.naturalHeight;

    // Extract layers and groups from the sprite sheet definitions.
    if (options.layers) {
      this.orderedLayers = options.layers;
    } else if (options.sourceJSON.meta.layers?.length ?? 0 > 0) {
      this.orderedLayers = [];
      for (const layerInfo of options.sourceJSON.meta.layers ?? []) {
        if ((layerInfo as AsepriteJSONLayer).opacity !== undefined) {
          this.orderedLayers.push(layerInfo.name);
        } else {
          if (!this.layerGroups[layerInfo.name])
            this.layerGroups[layerInfo.name] = [];
        }
        if (layerInfo.group !== undefined) {
          if (!this.layerGroups[layerInfo.group])
            this.layerGroups[layerInfo.group] = [];
          this.layerGroups[layerInfo.group].push(layerInfo.name);
        }
      }
    } else {
      this.orderedLayers = [defaultLayerName];
    }

    // If tags are available, populate tags and min/max frames.
    if (options.sourceJSON.meta.frameTags?.length) {
      this.currentTag = options.sourceJSON.meta.frameTags[0]?.name ?? null;
      for (const frameTag of options.sourceJSON.meta.frameTags) {
        this.tags[frameTag.name] = frameTag;
        if (this.minFrame === -1) {
          this.minFrame = frameTag.from;
        } else {
          this.minFrame = Math.min(this.minFrame, frameTag.from);
        }
        this.maxFrame = Math.max(this.maxFrame, frameTag.to);
      }
    }

    // Get the hash of frame filenames to frames.
    let framesByFilename: Record<string, AsepriteJSONFrame> | undefined;
    if (Array.isArray(options.sourceJSON.frames)) {
      framesByFilename = {};
      for (const frame of options.sourceJSON.frames) {
        framesByFilename[frame.filename] = frame;
      }
    } else {
      framesByFilename = options.sourceJSON.frames;
    }

    // Ensure we have at least one frame.
    const framesByFilenameKeys = Object.keys(framesByFilename);
    if (framesByFilenameKeys.length === 0)
      throw new Error("[ThreeAseprite]: no frames present in source JSON.");

    // Populate frames. This is easy if either:
    // - there are layers, tags, and there's a frameName function.
    // - there are no layers or tags.
    // TODO: support pattern matching.
    if (this.minFrame === -1) {
      this.minFrame = Number.parseInt(framesByFilenameKeys[0]);
      if (Number.isNaN(this.minFrame))
        throw new Error(
          "[ThreeAseprite]: unable to resolve first frame index for sprite."
        );
    }
    if (this.maxFrame === -1) {
      if (this.orderedLayers.length > 1)
        console.warn(
          `[ThreeAseprite]: layers were supplied but frames were not - using best guess based on frame defs length / layer count.`
        );
      this.maxFrame =
        this.minFrame +
        Math.floor(framesByFilenameKeys.length / this.orderedLayers.length) -
        1;
    }
    if (this.minFrame > this.maxFrame)
      throw new Error("[ThreeAseprite]: unable to resolve frame range.");
    this.currentFrame = this.minFrame;

    // Extract and map frames.
    if (options.frameNameToFrameParams) {
      const frameNameToFrameParams = options.frameNameToFrameParams;
      for (const [frameName, frame] of Object.entries(framesByFilename)) {
        const frameParams = frameNameToFrameParams(frameName);
        const frameIndex = frameParams.frame;
        const frameLayer = frameParams.layerName ?? defaultLayerName;
        if (frameIndex === undefined) {
          console.warn(
            "[ThreeAseprite]: failed to get frame index from frameNameToFrameParams."
          );
          continue;
        }
        let frameInfo: FrameInfo | undefined = this.frames[frameIndex];
        if (frameInfo === undefined) {
          frameInfo = {
            duration: frame.duration,
            layerFrames: {},
          };
          this.frames[frameIndex] = frameInfo;
        }
        frameInfo.layerFrames[frameLayer] = frame;
      }
    } else {
      let frameKeyIndex = 0;
      for (
        let frameIndex = this.minFrame;
        frameIndex <= this.maxFrame;
        frameIndex++
      ) {
        const frameInfo: FrameInfo = {
          duration: 0,
          layerFrames: {},
        };
        for (
          let layerIndex = 0;
          layerIndex < this.orderedLayers.length;
          layerIndex++
        ) {
          const layerName = this.orderedLayers[layerIndex];
          let frameName: string | undefined;
          if (options.frameName) {
            frameName = options.frameName({
              frame: frameIndex,
              layerName: layerName,
            });
          } else {
            // This makes a huge assumption that Aseprite will always export things in the expected order.
            frameName = framesByFilenameKeys[frameKeyIndex++];
          }
          if (frameName === undefined)
            throw new Error(
              `[ThreeAsperite]: unable to identify frame name (frame ${frameIndex}, layer ${layerName}).`
            );
          const frameDef = framesByFilename[frameName];
          if (frameDef === undefined) continue;
          frameInfo.duration = Math.max(frameInfo.duration, frameDef.duration);
          frameInfo.layerFrames[layerName] = frameDef;
        }
        this.frames[frameIndex] = frameInfo;
      }
    }

    // Create geometry.
    const quadCount = this.orderedLayers.length;
    this.vtxIndex = new Uint16Array(6 * quadCount);
    this.vtxPos = new Float32Array(12 * quadCount);
    this.vtxUV = new Float32Array(8 * quadCount);
    this.vtxOpacity = new Float32Array(4 * quadCount);
    this.vtxColor = new Float32Array(12 * quadCount);
    this.vtxFade = new Float32Array(16 * quadCount);
    this.vtxOutlineSpread = new Float32Array(8 * quadCount);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new BufferAttribute(this.vtxPos, 3));
    this.geometry.setAttribute("uv", new BufferAttribute(this.vtxUV, 2));
    this.geometry.setAttribute(
      "vtxOpacity",
      new BufferAttribute(this.vtxOpacity, 1)
    );
    this.geometry.setAttribute(
      "vtxColor",
      new BufferAttribute(this.vtxColor, 3)
    );
    this.geometry.setAttribute("vtxFade", new BufferAttribute(this.vtxFade, 4));
    this.geometry.setAttribute(
      "vtxOutlineSpread",
      new BufferAttribute(this.vtxOutlineSpread, 2)
    );
    this.geometry.setIndex(new BufferAttribute(this.vtxIndex, 1));
    this.vtxOpacity.fill(1);
    this.vtxColor.fill(1);
    this.vtxOutlineSpread.fill(1);

    // Initialize indices and layer z values.
    for (let qi = 0; qi < quadCount; qi++) {
      const qi6 = qi * 6;
      const qi4 = qi * 4;
      this.vtxIndex[qi6 + 0] = qi4 + 0;
      this.vtxIndex[qi6 + 1] = qi4 + 1;
      this.vtxIndex[qi6 + 2] = qi4 + 2;
      this.vtxIndex[qi6 + 3] = qi4 + 2;
      this.vtxIndex[qi6 + 4] = qi4 + 3;
      this.vtxIndex[qi6 + 5] = qi4 + 0;
      const qi12 = qi * 12;
      this.vtxPos[qi12 + 2] = qi * layerDepth;
      this.vtxPos[qi12 + 5] = qi * layerDepth;
      this.vtxPos[qi12 + 8] = qi * layerDepth;
      this.vtxPos[qi12 + 11] = qi * layerDepth;
    }

    // Create material.
    this.material = createAspriteShaderMaterial({
      texture: options.texture,
    });

    // Create mesh.
    this.mesh = new Mesh(this.geometry, this.material);

    // We assume the coordinate system is the same as screen-space coordinates in all math,
    // buy typical camera coordinates are Y-up.
    this.mesh.scale.y = -1;

    // Initialize geometry to default tag and frame.
    this.updateGeometryToFrame(this.currentFrame);
  }
  clone(): ThreeAseprite<LayerNames> {
    // TODO: advance to the correct frame.
    // TODO: copy opacity/color configs.
    return new ThreeAseprite(this.options);
  }
  getCurrentFrame() {
    return this.currentFrame;
  }
  getFrameDuration(frameNumber: number) {
    const frame = this.frames[frameNumber];
    if (frame === undefined) return 0;
    return frame.duration;
  }
  getCurrentFrameDuration() {
    const frame = this.frames[this.currentFrame];
    if (frame === undefined) return 0;
    return frame.duration;
  }
  getCurrentTag() {
    return this.currentTag;
  }
  getCurrentTagFrame() {
    if (this.currentTag === null) return null;
    const tag = this.tags[this.currentTag];
    return this.currentTagFrame;
  }
  getCurrentTagFrameCount() {
    if (this.currentTag === null) return null;
    const tag = this.tags[this.currentTag];
    return tag.to - tag.from + 1;
  }
  animate(deltaMs: number) {
    if (!this.playingAnimation) return;
    let frameNo = this.currentFrame;
    let frame = this.frames[frameNo];
    if (frame === undefined) return;
    this.currentFrameTime += deltaMs;
    if (frame.duration >= this.currentFrameTime) {
      return;
    }
    const tag = this.currentTag ? this.tags[this.currentTag] : undefined;
    const step = this.playingAnimationBackwards ? -1 : 1;
    let remainingDeltaMs = this.currentFrameTime;
    let frameNoMin = this.minFrame;
    let frameNoRange = this.maxFrame - this.minFrame + 1;
    if (tag !== undefined) {
      frameNoMin = tag.from;
      frameNoRange = tag.to - tag.from + 1;
    }
    let eventsToDispatch: Parameters<typeof this.dispatchEvent>[0][] = [];
    while (remainingDeltaMs > frame.duration) {
      remainingDeltaMs -= frame.duration || 1;
      frameNo =
        ((frameNo - frameNoMin + step + frameNoRange) % frameNoRange) +
        frameNoMin;
      if (this.playingAnimationBackwards) {
        if (frameNo === frameNoMin + frameNoRange - 1) {
          eventsToDispatch.push(ANIMATION_COMPLETE_EVENT);
        }
      } else {
        if (frameNo === frameNoMin) {
          eventsToDispatch.push(ANIMATION_COMPLETE_EVENT);
        }
      }
      frame = this.frames[frameNo];
      if (frame === undefined) return;
      this.currentFrame = frameNo;
      const triggers = this.triggers[frameNo];
      if (triggers !== undefined) {
        for (const trigger of triggers) {
          if (trigger.tagName !== null && trigger.tagName !== this.currentTag)
            continue;
          eventsToDispatch.push({
            type: trigger.eventName as Extract<EventNames, string>,
          });
        }
      }
    }
    this.currentFrameTime = remainingDeltaMs;
    if (tag !== undefined) {
      this.currentTagFrame = frameNo - tag.from;
    }
    this.updateGeometryToFrame(frameNo);
    for (const event of eventsToDispatch) {
      this.dispatchEvent(event);
    }
  }
  gotoTag(tagName: string | null) {
    if (this.currentTag === tagName) return;
    if (tagName === null) {
      this.currentTag = null;
      this.currentTagFrame = null;
      return;
    }
    const tag = this.tags[tagName];
    if (tag === undefined) return;
    this.currentTag = tagName;
    this.currentTagFrame = 0;
    this.currentFrame = tag.from;
    this.currentFrameTime = 0;
    this.updateGeometryToFrame(this.currentFrame);
    this.dispatchEvent(TAG_SWITCHED_EVENT);
  }
  gotoFrame(frameNo: number) {
    if (this.currentFrame === frameNo) return;
    this.currentFrame = frameNo;
    this.currentFrameTime = 0;
    this.updateGeometryToFrame(frameNo);
  }
  gotoTagFrame(tagFrameNo: number) {
    if (this.currentTag === null) return;
    const tag = this.tags[this.currentTag];
    if (tag === undefined) return;
    let tagFrameNoWrapped = tagFrameNo;
    if (tagFrameNoWrapped < 0) tagFrameNoWrapped += tag.to - tag.from;
    this.currentTagFrame = tagFrameNoWrapped;
    this.currentFrame = tagFrameNoWrapped + tag.from;
    this.currentFrameTime = 0;
    this.updateGeometryToFrame(this.currentFrame);
  }
  setClipping(clipping: LayerClipping | null) {
    this.clipping = clipping ?? undefined;
  }
  private updateGeometryToFrame(frameNo: number) {
    const { textureWidth, textureHeight, offset, clipping, outlineSpread } =
      this;
    const { x: xOffset, y: yOffset } = offset;
    const invWidth = 1 / textureWidth;
    const invHeight = 1 / textureHeight;
    const frameDef = this.frames[frameNo];
    if (frameDef === undefined)
      throw new Error(`[ThreeAseprite]: unknown frame "#${frameNo}".`);
    for (let li = 0; li < this.orderedLayers.length; li++) {
      const layerName = this.orderedLayers[li];
      const layerFrameDef = frameDef.layerFrames[layerName] ?? emptyFrameDef;
      let { x, y, w, h } = layerFrameDef.frame;
      let { x: sx, y: sy } = layerFrameDef.spriteSourceSize;
      let { w: sw, h: sh } = layerFrameDef.sourceSize;

      // Apply optional clipping.
      if (clipping !== undefined) {
        const { xMin, xMax, yMin, yMax } = clipping;
        if (xMin !== undefined && xMin > sx) {
          const deltaX = xMin - sx;
          x += deltaX;
          sx += deltaX;
          w -= deltaX;
        }
        if (xMax !== undefined && xMax < sx + w) {
          const deltaX = sx + w - xMax;
          w -= deltaX;
        }
        if (yMin !== undefined && yMin > sy) {
          const deltaY = yMin - sy;
          y += deltaY;
          sy += deltaY;
          h -= deltaY;
        }
        if (yMax !== undefined && yMax < sy + h) {
          const deltaY = sy + h - yMax;
          h -= deltaY;
        }
        if (w <= 0) {
          x = 0;
          w = 0;
          sx = 0;
          sw = 0;
        }
        if (h <= 0) {
          y = 0;
          h = 0;
        }
      }

      // Apply optional outlining.
      if (outlineSpread !== undefined && layerFrameDef !== emptyFrameDef) {
        // sx -= outlineSpread;
        // sy -= outlineSpread;
        sw += outlineSpread * 2;
        sh += outlineSpread * 2;
        x -= outlineSpread;
        y -= outlineSpread;
        w += outlineSpread * 2;
        h += outlineSpread * 2;
      }

      // Update vertex positions.
      const vtxI = 12 * li;
      this.vtxPos[vtxI + 0] = w * 0 + sx - sw * 0.5 + xOffset;
      this.vtxPos[vtxI + 1] = h * 0 + sy - sh * 0.5 + yOffset;
      this.vtxPos[vtxI + 3] = w * 1 + sx - sw * 0.5 + xOffset;
      this.vtxPos[vtxI + 4] = h * 0 + sy - sh * 0.5 + yOffset;
      this.vtxPos[vtxI + 6] = w * 1 + sx - sw * 0.5 + xOffset;
      this.vtxPos[vtxI + 7] = h * 1 + sy - sh * 0.5 + yOffset;
      this.vtxPos[vtxI + 9] = w * 0 + sx - sw * 0.5 + xOffset;
      this.vtxPos[vtxI + 10] = h * 1 + sy - sh * 0.5 + yOffset;
      this.geometry.getAttribute("position").needsUpdate = true;

      // Update texture coordinates.
      const vtxUVI = 8 * li;
      this.vtxUV[vtxUVI + 0] = x * invWidth;
      this.vtxUV[vtxUVI + 1] = 1 - y * invHeight;
      this.vtxUV[vtxUVI + 2] = (x + w) * invWidth;
      this.vtxUV[vtxUVI + 3] = 1 - y * invHeight;
      this.vtxUV[vtxUVI + 4] = (x + w) * invWidth;
      this.vtxUV[vtxUVI + 5] = 1 - (y + h) * invHeight;
      this.vtxUV[vtxUVI + 6] = x * invWidth;
      this.vtxUV[vtxUVI + 7] = 1 - (y + h) * invHeight;
      this.geometry.getAttribute("uv").needsUpdate = true;

      // Update bounding box.
      this.geometry.computeBoundingBox();
    }
  }
  protected expandLayerGroups<T>(
    attrMap: Partial<Record<LayerNames, T>>
  ): Partial<Record<LayerNames, T>> {
    const assignments: Partial<Record<LayerNames, T>> = {};
    const toAssign = [...Object.entries(attrMap)] as [LayerNames, T][];
    while (toAssign.length > 0) {
      const assignment = toAssign.pop();
      if (assignment === undefined) break;
      const [layer, value] = assignment;
      assignments[layer] = value;
      if (this.layerGroups[layer]) {
        for (const subLayer of this.layerGroups[layer]) {
          toAssign.push([subLayer as LayerNames, value]);
        }
      }
    }
    return assignments;
  }
  /**
   * Sets the sprite's opacity.
   * @param opacity
   */
  setOpacity(opacity: number) {
    this.material.uniforms.opacity.value = opacity;
    this.material.uniformsNeedUpdate = true;
  }
  /**
   * Sets an optional multiplicative color for the sprite.
   * @param color
   */
  setColor(color: ColorRepresentation) {
    (this.material.uniforms.color.value as Color).set(color);
    this.material.uniformsNeedUpdate = true;
  }
  /**
   * Sets an optional fade color for the sprite.
   * @param fadeColor
   * @param fadeAmount
   */
  setFade(fadeColor: ColorRepresentation, fadeAmount: number) {
    const color = new Color(fadeColor);
    const fade4 = this.material.uniforms.fade.value as Vector4;
    fade4.set(color.r, color.g, color.b, fadeAmount);
    this.material.uniformsNeedUpdate = true;
  }
  /**
   * Sets an optional opacity per layer, plus an optional default to apply to all others.
   * This is useful when sprites have multiple conditional layers.
   * @param opacityMap
   * @param defaultOpacity
   */
  setLayerOpacities(
    opacityMap: Partial<Record<LayerNames, number>>,
    defaultOpacity?: number
  ) {
    const opacityAssignments = this.expandLayerGroups(opacityMap);
    for (let li = 0; li < this.orderedLayers.length; li++) {
      const layerName = this.orderedLayers[li] as LayerNames;
      const layerOpacity = opacityAssignments[layerName] ?? defaultOpacity;
      if (layerOpacity === undefined) continue;
      const oi = li * 4;
      this.vtxOpacity[oi + 0] = layerOpacity;
      this.vtxOpacity[oi + 1] = layerOpacity;
      this.vtxOpacity[oi + 2] = layerOpacity;
      this.vtxOpacity[oi + 3] = layerOpacity;
    }
    this.geometry.getAttribute("vtxOpacity").needsUpdate = true;
  }
  /**
   * Sets an optional multiplicative color per layer. This is useful for sprite recoloration.
   * @param colorMap
   */
  setLayerColors(colorMap: Partial<Record<LayerNames, ColorRepresentation>>) {
    const colorAssignments = this.expandLayerGroups(colorMap);
    const color = new Color();
    for (let li = 0; li < this.orderedLayers.length; li++) {
      const layerName = this.orderedLayers[li] as LayerNames;
      const colorAssignment = colorAssignments[layerName];
      if (colorAssignment === undefined) continue;
      color.set(colorAssignment);
      const ci = li * 12;
      color.toArray(this.vtxColor, ci + 0);
      color.toArray(this.vtxColor, ci + 3);
      color.toArray(this.vtxColor, ci + 6);
      color.toArray(this.vtxColor, ci + 9);
    }
    this.geometry.getAttribute("vtxColor").needsUpdate = true;
  }
  /**
   * Sets an optional fade color and amount per layer. This is useful for sprite recoloration.
   * @param colorMap
   */
  setLayerFades(
    colorMap: Partial<Record<LayerNames, [ColorRepresentation, number]>>
  ) {
    const fadeAssignments = this.expandLayerGroups(colorMap);
    const color = new Color();
    for (let li = 0; li < this.orderedLayers.length; li++) {
      const layerName = this.orderedLayers[li] as LayerNames;
      const fade = fadeAssignments[layerName];
      if (fade === undefined) continue;
      const [colorRep, fadeAmount] = fade;
      color.set(colorRep);
      const fi = li * 16;
      color.toArray(this.vtxFade, fi + 0);
      color.toArray(this.vtxFade, fi + 4);
      color.toArray(this.vtxFade, fi + 8);
      color.toArray(this.vtxFade, fi + 12);
      this.vtxFade[fi + 3] = fadeAmount;
      this.vtxFade[fi + 7] = fadeAmount;
      this.vtxFade[fi + 11] = fadeAmount;
      this.vtxFade[fi + 15] = fadeAmount;
    }
    this.geometry.getAttribute("vtxFade").needsUpdate = true;
  }
  /**
   * Sets an optional outline on the sprite. Outlines expand the boundaries
   * of the sprite by a specified number of pixels with a specified color and opacity.
   *
   * When using this feature, ensure the sprite sheet has a padding equal or greater
   * than 2 * outlineWidth; otherwise, collisions with other frames will occur.
   * @param outlineWidth - width, in sprite-space pixels, of the outline.
   * @param outlineColor - color of the outline.
   * @param outlineOpacity - opacity of the outline.
   */
  setOutline(
    outlineWidth: number,
    outlineColor?: ColorRepresentation,
    outlineOpacity?: number
  ) {
    const uOutlineSpread = this.material.uniforms.outlineSpread
      .value as Vector2;
    const uOutline = this.material.uniforms.outline.value as Vector4;
    const changedSpread = this.outlineSpread !== outlineWidth;
    if (outlineWidth > 0 && outlineColor !== undefined) {
      const outlineColorAsColor = new Color(outlineColor);
      this.outlineSpread = outlineWidth;
      uOutlineSpread.set(
        outlineWidth / this.textureWidth,
        outlineWidth / this.textureHeight
      );
      uOutline.set(
        outlineColorAsColor.r,
        outlineColorAsColor.g,
        outlineColorAsColor.b,
        outlineOpacity ?? 1
      );
    } else {
      this.outlineSpread = 0;
      uOutlineSpread.set(0, 0);
      uOutline.set(0, 0, 0, 0);
    }
    this.material.uniformsNeedUpdate = true;
    if (changedSpread) this.updateGeometryToFrame(this.currentFrame);
  }
  /**
   * Sets optional outline distances for each layer of the sprite.
   * These widths are relative to the outline width set in setOutline.
   */
  setRealtiveLayerOutlines(
    outlineSizeMap: Partial<Record<LayerNames, number>>
  ) {
    const outlineAssignments = this.expandLayerGroups(outlineSizeMap);
    for (let li = 0; li < this.orderedLayers.length; li++) {
      const layerName = this.orderedLayers[li] as LayerNames;
      const size = outlineAssignments[layerName];
      if (size === undefined) continue;
      const fi = li * 8;
      for (let oi = 0; oi < 8; oi++) this.vtxOutlineSpread[fi + oi] = size;
    }
    this.geometry.getAttribute("vtxOutlineSpread").needsUpdate = true;
  }
  /**
   * Get available layers.
   * @returns
   */
  getLayers() {
    return this.orderedLayers;
  }
  /**
   * Get available layer groups.
   * @returns
   */
  getLayerGroups() {
    return this.layerGroups;
  }
  /**
   * Get available tags.
   * @returns
   */
  getTags() {
    return this.tags;
  }
  /**
   * Adds an event trigger at the specified frame.
   * @param frameNo
   * @param eventName
   */
  addFrameTrigger(frameNo: number, eventName: EventNames) {
    const trigger: Trigger<EventNames> = {
      tagName: null,
      eventName,
    };
    if (this.triggers[frameNo] === undefined) this.triggers[frameNo] = [];
    this.triggers[frameNo].push(trigger);
  }
  /**
   * Adds an event trigger at the specified tag and frame.
   * @param tagName
   * @param tagFrameNo
   * @param eventName
   * @returns
   */
  addTagFrameTrigger(
    tagName: string,
    tagFrameNo: number,
    eventName: EventNames
  ) {
    const tag = this.tags[tagName];
    if (tag === undefined) return;
    const frameNo = tag.from + tagFrameNo;
    const trigger: Trigger<EventNames> = {
      tagName,
      eventName,
    };
    if (this.triggers[frameNo] === undefined) this.triggers[frameNo] = [];
    this.triggers[frameNo].push(trigger);
  }
  /**
   * Removes an event trigger.
   * @param frameNo
   * @param eventName
   */
  removeFrameTrigger(frameNo: number, eventName: EventNames) {
    if (this.triggers[frameNo])
      this.triggers[frameNo] = this.triggers[frameNo].filter((t) => {
        if (t.eventName !== eventName) return true;
        if (t.tagName !== null) return true;
        return false;
      });
  }
  /**
   * Removes a tagged event trigger.
   */
  removeTagFrameTrigger(
    tagName: string,
    tagFrameNo: number,
    eventName: EventNames
  ) {
    const tag = this.tags[tagName];
    if (tag === undefined) return;
    const frameNo = tag.from + tagFrameNo;
    if (this.triggers[frameNo])
      this.triggers[frameNo] = this.triggers[frameNo].filter((t) => {
        if (t.eventName !== eventName) return true;
        if (t.tagName !== tagName) return true;
        return false;
      });
  }
  /**
   * Determines whether a given layer of layer group is present within a given tag.
   * This is primairly used by the example to produce a clickable group/tag matrix.
   * @param layerOrGroupName
   * @param tagName
   * @param detectEmpty
   */
  hasLayerAtTag(
    layerOrGroupName: LayerNames,
    tagName: string,
    detectEmpty?: boolean
  ) {
    const allSubLayers = Object.keys(
      this.expandLayerGroups({ [layerOrGroupName]: true } as Partial<
        Record<LayerNames, boolean>
      >)
    );
    const tag = this.tags[tagName];
    if (tag === undefined) return false;
    for (let fi = tag.from; fi <= tag.to; fi++) {
      const frame = this.frames[fi];
      if (frame === undefined) continue;
      for (const layerName of allSubLayers) {
        const layerInfo = frame.layerFrames[layerName];
        if (layerInfo === undefined) continue;
        if (detectEmpty && layerInfo.frame.w < 2 && layerInfo.frame.h < 2)
          continue;
        return true;
      }
    }
    return false;
  }
  /**
   * Dispose of geometry and material.
   */
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
  /**
   * Gets the bounding box, in pixels, of a given layer.
   * @param layerName
   */
  getLayerBoundingBox(
    layerName: LayerNames | LayerNames[],
    tagName?: string,
    frameNo?: number
  ): LayerClipping | null {
    const initialLayers: Partial<Record<LayerNames, true>> = {};
    if (Array.isArray(layerName)) {
      for (const singleLayerName of layerName) {
        initialLayers[singleLayerName] = true;
      }
    } else {
      initialLayers[layerName] = true;
    }
    const allSubLayers = Object.keys(
      this.expandLayerGroups(initialLayers)
    ) as LayerNames[];
    return this.getMultiLayerBoundingBox(allSubLayers, tagName, frameNo);
  }
  /**
   * Sets the offset for this sprite.
   * @param offset
   */
  public setOffset(offset: Vector2) {
    this.offset.copy(offset);
    this.updateGeometryToFrame(this.currentFrame);
  }
  private getMultiLayerBoundingBox(
    layerNames: LayerNames[],
    tagName?: string,
    frameNo?: number
  ): LayerClipping | null {
    let frameIndex = this.currentFrame;
    if (tagName && frameNo) {
      frameIndex = this.tags[tagName].from + frameNo;
    } else if (tagName) {
      frameIndex = this.tags[tagName].from;
    } else if (frameNo) {
      frameIndex = frameNo;
    }

    const offset = this.offset;

    const frame = this.frames[frameIndex];
    if (frame === undefined)
      throw new Error("[ThreeAseprite]: frame not found.");

    let bounds: LayerClipping | null = null;
    for (const layerName of layerNames) {
      const layerFrame = frame.layerFrames[layerName];
      if (layerFrame === undefined) continue;

      const { x, y, w, h } = layerFrame.spriteSourceSize;
      const { w: sw, h: sh } = layerFrame.sourceSize;

      // Empty layers don't have bounding boxes.
      if (x === 0 && y === 0 && w === 1 && h === 1) continue;

      const leftBound = w * 0 + x - sw * 0.5 + offset.x;
      const rightBound = w * 1 + x - sw * 0.5 + offset.x;
      const bottomBound = h * 0 + y - sh * 0.5 + offset.y;
      const topBound = h * 1 + y - sh * 0.5 + offset.y;

      if (bounds === null) {
        bounds = {
          xMin: leftBound,
          xMax: rightBound,
          yMin: bottomBound,
          yMax: topBound,
        };
      } else {
        bounds.xMin = Math.min(bounds.xMin, leftBound);
        bounds.xMax = Math.max(bounds.xMax, rightBound);
        bounds.yMin = Math.min(bounds.yMin, bottomBound);
        bounds.yMax = Math.max(bounds.yMax, topBound);
      }
    }

    return bounds;
  }
  // Redeclare parent class's method signature.
  // This addresses a TS / VsCode bug where these methods aren't available.
  addEventListener<T extends Extract<EventNames | StandardEvents, string>>(
    type: T,
    listener: EventListener<
      Record<
        EventNames | StandardEvents,
        FrameTriggerEvent<EventNames | StandardEvents>
      >[T],
      T,
      this
    >
  ): void {
    super.addEventListener(type, listener);
  }
  hasEventListener<T extends Extract<EventNames | StandardEvents, string>>(
    type: T,
    listener: EventListener<
      Record<
        EventNames | StandardEvents,
        FrameTriggerEvent<EventNames | StandardEvents>
      >[T],
      T,
      this
    >
  ): boolean {
    return super.hasEventListener(type, listener);
  }
  removeEventListener<T extends Extract<EventNames | StandardEvents, string>>(
    type: T,
    listener: EventListener<
      Record<
        EventNames | StandardEvents,
        FrameTriggerEvent<EventNames | StandardEvents>
      >[T],
      T,
      this
    >
  ): void {
    super.removeEventListener(type, listener);
  }
}
