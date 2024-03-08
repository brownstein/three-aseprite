// Main frame definition format.
export type AsepriteJSONFrame = {
  frame: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  rotated: boolean;
  trimmed: boolean;
  spriteSourceSize: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  sourceSize: {
    w: number;
    h: number;
  };
  duration: number;
};

// Filename is included in array export mode.
export type AsepriteJSONFrameWithFilename = AsepriteJSONFrame & {
  filename: string;
};

// Group information.
export type AsepriteJSONGroup = {
  name: string;
  group?: string;
};

// Layer information.
export type AsepriteJSONLayer = {
  name: string;
  opacity: number;
  blendMode: string;
  group?: string;
};

// Tag information.
export type AsepriteJSONFrameTag = {
  name: string;
  from: number;
  to: number;
  direction: string;
};

// Meta section.
export type AsepriteJSONMeta = {
  app: string;
  version: string;
  image: string;
  format: string;
  size: {
    w: number;
    h: number;
  };
  scale: string;
  // Frame tags reperesent individual animations.
  frameTags?: AsepriteJSONFrameTag[];
  // Layers include both groups (stubs) and layer metadata.
  layers?: (AsepriteJSONLayer | AsepriteJSONGroup)[];
  // I still haven't figured out slices. Contributors welcome.
  slices?: unknown[];
};

// Aseprite allows users to export either an object or an array of frames.
export type AsepriteFramesObject = { [key: string]: AsepriteJSONFrame };
export type AsepriteFramesArray = AsepriteJSONFrameWithFilename[];

// Overall file format.
export type AsepriteJSON = {
  frames: AsepriteFramesObject | AsepriteFramesArray;
  meta: AsepriteJSONMeta;
}
