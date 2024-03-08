import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ColorRepresentation,
  DoubleSide,
  EventDispatcher,
  Mesh,
  MeshBasicMaterial,
  RawShaderMaterial,
  Texture,
  Vector2,
  Vector4,
} from "three";

import {
  AsepriteFramesObject,
  AsepriteJSON,
  AsepriteJSONFrame,
  AsepriteJSONFrameTag,
  AsepriteJSONLayer,
} from "./aseprite-export-types";
import {
  createAspriteShaderMaterial
} from "./aseprite-shader-material";

export * from "./aseprite-export-types";

// Interface type for vectors passed to the sprite.
export type IVector2 = {
  x: number;
  y: number;
};

// Parameters provided to FrameNameSpecifier.
export type FrameParams = {
  frame: number;
  tagFrame: number;
  tagName: string;
  layerName: string;
};

// Frames are referenced by name, but there's a freeform
// text field with formatting options in Aseprite that allows
// a variety of formats. Therefore, we expect the user to provide
// a function that maps FrameParams to the layer's filename.
export type FrameNameSpecifier = (frameParams: FrameParams) => string;

// Options passed to the constructor for ThreeAseprite.
export type ThreeAsepriteOptions<LayerName> = {
  texture: Texture;
  sourceJSON: AsepriteJSON;
  frameName: FrameNameSpecifier,
  offset?: IVector2;
  layers?: LayerName[];
  layerDepth?: number;
};

// Internal bookkeeping for sets of frames.
type FrameSet = {
  [layerName: string]: AsepriteJSONFrame;
};

// Internal bookkeeping for layers.
type LayerData = {
  color: Color;
  opacity: number;
  fadeColor: Color;
  fadeAmount: number;
  clipping?: {
    xMin?: number;
    yMin?: number;
    xMax?: number;
    yMax?: number;
  }
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
  duration: 100
};

export type LayerClipping = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export const defaultLayerName = "Default";
export const defaultTagName = "Default";

/**
 * Three.js aseprite sprite renderer class.
 */
export class ThreeAseprite<LayerNames extends string = string> extends EventDispatcher {
  public mesh: Mesh;
  public texture: Texture;
  public playingAnimation: boolean = true;
  public playingAnimationBackwards: boolean = false;
  public readonly sourceJSON: AsepriteJSON;
  private orderedLayers: string[];
  private layerGroups: LayerGrouping = {};
  currentTag: string;
  private currentFrame: number = 0;
  private frames: { [key: string]: FrameSet[] } = {};
  private geometry: BufferGeometry;
  private material: RawShaderMaterial;
  private textureWidth: number;
  private textureHeight: number;
  private frameTime: number = 0;
  private vtxIndex: Uint16Array;
  private vtxPos: Float32Array;
  private vtxUV: Float32Array;
  private vtxOpacity: Float32Array;
  private vtxColor: Float32Array;
  private vtxFade: Float32Array;
  private offset: Vector2 = new Vector2();
  private emitByTagFrame: { [key: string]: string[] } = {};
  private options: ThreeAsepriteOptions<LayerNames>;
  private clipping?: LayerClipping;
  private outlineSpread?: number;
  constructor(options: ThreeAsepriteOptions<LayerNames>) {
    super();

    // Preserve options to allow easy cloning later.
    this.options = options;
    this.sourceJSON = options.sourceJSON;
    if (options.offset) {
      this.offset.x = options.offset.x;
      this.offset.y = options.offset.y;
    }
    const layerDepth = options.layerDepth ?? 0.05;

    // Assign texture, size.
    this.texture = options.texture;

    // We assume that textures are loaded through Three.TextureLoaded
    // and contain references to images. Video textures not supported.
    this.textureWidth = this.texture.image.naturalWidth;
    this.textureHeight = this.texture.image.naturalHeight;
    
    // Extract layers from the sprite sheet definitions.
    if (options.layers) {
      this.orderedLayers = options.layers;
    } else if (options.sourceJSON.meta.layers?.length ?? 0 > 0) {
      this.orderedLayers = [];
      for (const layerInfo of options.sourceJSON.meta.layers ?? []) {
        if ((layerInfo as AsepriteJSONLayer).opacity !== undefined) {
          this.orderedLayers.push(layerInfo.name);
        } else {
          if (!this.layerGroups[layerInfo.name]) this.layerGroups[layerInfo.name] = [];
        }
        if (layerInfo.group !== undefined) {
          if (!this.layerGroups[layerInfo.group]) this.layerGroups[layerInfo.group] = [];
          this.layerGroups[layerInfo.group].push(layerInfo.name);
        }
      }
    } else {
      this.orderedLayers = [defaultLayerName];
    }

    // Extra frame tags from sprite sheet definitions.
    let frameTags: AsepriteJSONFrameTag[] = [];
    if (options.sourceJSON.meta.frameTags?.length) {
      frameTags = options.sourceJSON.meta.frameTags;
    } else {
      frameTags.push({
        name: defaultTagName,
        from: 0,
        to: Array.isArray(options.sourceJSON.frames)
          ? options.sourceJSON.frames.length - 1
          : Object.keys(options.sourceJSON.frames).length - 1,
        direction: "forward"
      });
    }
    this.currentTag = frameTags.at(0)?.name ?? defaultTagName;

    // We want to support both object and array based source frames.
    const framesByFilename = Array.isArray(this.sourceJSON.frames)
      ? this.sourceJSON.frames.reduce((acc, frame) => {
        acc[frame.filename] = frame;
        return acc;
      }, {} as AsepriteFramesObject)
      : this.sourceJSON.frames;

    // For each tag, for each layer, store frame in lookup object.
    for (const frameTag of frameTags) {
      const tagName = frameTag.name;
      this.frames[tagName] = [];
      for (let i = frameTag.from; i <= frameTag.to; i++) {
        const frame = i;
        const tagFrame = i - frameTag.from;
        const frameSet: FrameSet = {};
        this.frames[tagName].push(frameSet);
        for (let li = 0; li < this.orderedLayers.length; li++) {
          const layerName = this.orderedLayers[li];
          const frameParams: FrameParams = { frame, tagFrame, tagName, layerName };
          const frameKey = options.frameName(frameParams);
          const frameDef: AsepriteJSONFrame = framesByFilename[frameKey];
          if (frameDef) frameSet[layerName] = frameDef;
        }
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
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new BufferAttribute(this.vtxPos, 3));
    this.geometry.setAttribute("uv", new BufferAttribute(this.vtxUV, 2));
    this.geometry.setAttribute("vtxOpacity", new BufferAttribute(this.vtxOpacity, 1));
    this.geometry.setAttribute("vtxColor", new BufferAttribute(this.vtxColor, 3));
    this.geometry.setAttribute("vtxFade", new BufferAttribute(this.vtxFade, 4));
    this.geometry.setIndex(new BufferAttribute(this.vtxIndex, 1));
    this.vtxOpacity.fill(1);
    this.vtxColor.fill(1);

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
      texture: options.texture
    });

    // Create mesh.
    this.mesh = new Mesh(this.geometry, this.material);

    // We assume the coordinate system is the same as screen-space coordinates in all math,
    // buy typical camera coordinates are Y-up.
    this.mesh.scale.y = -1;

    // Initialize geometry to default tag and frame.
    this.updateGeometryToTagFrame(this.currentTag, 0);
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
    const frameDefs = this.frames[this.currentTag];
    if (frameDefs === undefined) return 0;
    const frameDef = frameDefs[frameNumber];
    if (frameDef === undefined) return 0;
    for (const layerDef of Object.values(frameDef)) {
      return layerDef.duration;
    }
    return 0;
  }
  getCurrentFrameDuration() {
    const frameDefs = this.frames[this.currentTag];
    if (frameDefs === undefined) return 0;
    const frameDef = frameDefs[this.currentFrame];
    if (frameDef === undefined) return 0;
    for (const layerDef of Object.values(frameDef)) {
      return layerDef.duration;
    }
    return 0;
  }
  getCurrentTag() {
    return this.currentTag;
  }
  getCurrentTagFrameCount() {
    return this.frames[this.currentTag]?.length ?? 0;
  }
  updateGeometryToTagFrame(tagName: string, frameNo: number) {
    const { textureWidth, textureHeight, offset, clipping, outlineSpread } = this;
    const { x: xOffset, y: yOffset } = offset;
    const invWidth = 1 / textureWidth;
    const invHeight = 1 / textureHeight;
    const tagDef = this.frames[tagName];
    if (tagDef === undefined) throw new Error(`[ThreeAseprite]: unknown tag "${tagName}".`);
    const frameDef = tagDef[frameNo % tagDef.length];
    if (frameDef === undefined) throw new Error(`[ThreeAseprite]: unknown frame "${tagName}#${frameNo}".`);
    for (let li = 0; li < this.orderedLayers.length; li++) {
      const layerName = this.orderedLayers[li];
      const layerFrameDef = frameDef[layerName] ?? emptyFrameDef;
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
        sx -= outlineSpread;
        sy -= outlineSpread;
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
  protected expandLayerGroups<T>(attrMap: Partial<Record<LayerNames, T>>): Partial<Record<LayerNames, T>> {
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
  setLayerOpacities(opacityMap: Partial<Record<LayerNames, number>>, defaultOpacity?: number) {
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
  setLayerFades(colorMap: Partial<Record<LayerNames, [ColorRepresentation, number]>>) {
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
  setOutline(outlineWidth: number, outlineColor?: ColorRepresentation, outlineOpacity?: number) {
    const uOutlineSpread = this.material.uniforms.outlineSpread.value as Vector2;
    const uOutline = this.material.uniforms.outline.value as Vector4;
    if (outlineWidth > 0 && outlineColor !== undefined) {
      const outlineColorAsColor = new Color(outlineColor);
      this.outlineSpread = outlineWidth;
      uOutlineSpread.set(outlineWidth / this.textureWidth, outlineWidth / this.textureHeight);
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
  }
  /**
   * Get available layers.
   * @returns 
   */
  getLayers() {
    return [...this.orderedLayers];
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
    return Object.keys(this.frames);
  }
  /**
   * Determines whether a given layer of layer group is present within a given tag.
   * This is primairly used by the example to produce a clickable group/tag matrix.
   * @param layerOrGroupName 
   * @param tagName 
   * @param detectEmpty
   */
  hasLayerAtTag(layerOrGroupName: LayerNames, tagName: string, detectEmpty?: boolean) {
    const allSubLayers = Object.keys(
      this.expandLayerGroups(
        { [layerOrGroupName]: true } as
        Partial<Record<LayerNames, boolean>>
      )
    );
    const tagFrames = this.frames[tagName];
    for (let fi = 0; fi < tagFrames.length; fi++) {
      const tagFrame = tagFrames[fi];
      if (tagFrame === undefined) continue;
      for (const layerName of allSubLayers) {
        const layerInfo = tagFrame[layerName];
        if (layerInfo === undefined) continue;
        if (detectEmpty && layerInfo.frame.w < 2 && layerInfo.frame.h < 2) continue;
        return true;
      }
    }
    return false;
  }
}
