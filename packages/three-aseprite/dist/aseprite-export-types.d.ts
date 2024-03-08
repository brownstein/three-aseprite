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
export type AsepriteJSONFrameWithFilename = AsepriteJSONFrame & {
    filename: string;
};
export type AsepriteJSONGroup = {
    name: string;
    group?: string;
};
export type AsepriteJSONLayer = {
    name: string;
    opacity: number;
    blendMode: string;
    group?: string;
};
export type AsepriteJSONFrameTag = {
    name: string;
    from: number;
    to: number;
    direction: string;
};
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
    frameTags?: AsepriteJSONFrameTag[];
    layers?: (AsepriteJSONLayer | AsepriteJSONGroup)[];
    slices?: unknown[];
};
export type AsepriteFramesObject = {
    [key: string]: AsepriteJSONFrame;
};
export type AsepriteFramesArray = AsepriteJSONFrameWithFilename[];
export type AsepriteJSON = {
    frames: AsepriteFramesObject | AsepriteFramesArray;
    meta: AsepriteJSONMeta;
};
