import { EventDispatcher, Mesh, Texture } from "three";
import { AsepriteJSON } from "./aseprite-export-types";
export type IVector2 = {
    x: number;
    y: number;
};
export type FrameParams = {
    frame: number;
    tagFrame: number;
    tagName: string;
    layerName: string;
};
export type FrameNameSpecifier = (frameParams: FrameParams) => string;
export type ThreeAsepriteOptions<LayerName> = {
    texture: Texture;
    sourceJSON: AsepriteJSON;
    frameName: FrameNameSpecifier;
    offset?: IVector2;
    layers?: LayerName[];
    layerDepth?: number;
};
export type LayerClipping = {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
};
/**
 * Three.js aseprite sprite renderer class.
 */
export declare class ThreeAseprite<LayerNames extends string = string> extends EventDispatcher {
    mesh: Mesh;
    texture: Texture;
    playingAnimation: boolean;
    playingBackwards: boolean;
    readonly sourceJSON: AsepriteJSON;
    private orderedLayers;
    private layerGroups;
    private currentTag;
    private currentFrame;
    private frames;
    private geometry;
    private material;
    private textureWidth;
    private textureHeight;
    private frameTime;
    private vtxIndex;
    private vtxPos;
    private vtxUV;
    private vtxOpacity;
    private vtxFade;
    private offset;
    private emitByTagFrame;
    private options;
    private clipping?;
    private outlineSpread?;
    constructor(options: ThreeAsepriteOptions<LayerNames>);
    updateGeometryToTagFrame(tagName: string, frameNo: number): void;
}
