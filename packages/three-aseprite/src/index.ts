import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  EventDispatcher,
  Mesh,
  MeshBasicMaterial,
  RawShaderMaterial,
  Texture,
  Vector2,
} from "three";

import {
  AsepriteFramesObject,
  AsepriteJSON,
  AsepriteJSONFrame,
  AsepriteJSONLayer,
} from "./aseprite-export-types";
import {
  createAspriteShaderMaterial
} from "./aseprite-shader-material";

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

/**
 * Three.js aseprite sprite renderer class.
 */
export class ThreeAseprite<LayerNames extends string = string> extends EventDispatcher {
  public mesh: Mesh;
  public texture: Texture;
  public playingAnimation: boolean = true;
  public playingBackwards: boolean = false;
  public readonly sourceJSON: AsepriteJSON;
  private orderedLayers: string[];
  private layerGroups: LayerGrouping = {};
  private currentTag: string;
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
      this.orderedLayers = ["Default"];
    }

    // Extra frame tags from sprite sheet definitions.
    const frameTags = options.sourceJSON.meta.frameTags ?? [];
    if (!frameTags.length) {
      frameTags.push({
        name: "Default",
        from: 0,
        to: Array.isArray(options.sourceJSON.frames)
          ? options.sourceJSON.frames.length
          : Object.keys(options.sourceJSON.frames).length,
        direction: "forward"
      });
    }
    this.currentTag = frameTags.at(0)?.name ?? "Default";

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
    this.vtxFade = new Float32Array(16 * quadCount);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new BufferAttribute(this.vtxPos, 3));
    this.geometry.setAttribute("uv", new BufferAttribute(this.vtxUV, 2));
    this.geometry.setAttribute("vtxOpacity", new BufferAttribute(this.vtxOpacity, 1));
    this.geometry.setAttribute("vtxFade", new BufferAttribute(this.vtxFade, 4));
    this.geometry.setIndex(new BufferAttribute(this.vtxIndex, 1));
    this.vtxOpacity.fill(1);

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

    // Initialize geometry to default tag and frame.
    this.updateGeometryToTagFrame(this.currentTag, 0);
  }
  updateGeometryToTagFrame(tagName: string, frameNo: number) {
    const { textureWidth, textureHeight, offset, clipping, outlineSpread } = this;
    const { x: xOffset, y: yOffset } = offset;
    const invWidth = 1 / textureWidth;
    const invHeight = 1 / textureHeight;
    const tagDef = this.frames[tagName];
    if (tagDef === undefined) throw new Error(`[ThreeAseprite]: unknown tag "${tagName}".`);
    const frameDef = tagDef[frameNo];
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
      if (outlineSpread !== undefined) {
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
}
