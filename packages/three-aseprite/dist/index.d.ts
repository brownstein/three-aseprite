import { ColorRepresentation, EventDispatcher, Mesh, Texture } from "three";
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
export declare const defaultLayerName = "Default";
export declare const defaultTagName = "Default";
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
    private vtxColor;
    private vtxFade;
    private offset;
    private emitByTagFrame;
    private options;
    private clipping?;
    private outlineSpread?;
    constructor(options: ThreeAsepriteOptions<LayerNames>);
    getFrame(): number;
    getTag(): string;
    updateGeometryToTagFrame(tagName: string, frameNo: number): void;
    protected expandLayerGroups<T>(attrMap: Partial<Record<LayerNames, T>>): Partial<Record<LayerNames, T>>;
    /**
     * Sets the sprite's opacity.
     * @param opacity
     */
    setOpacity(opacity: number): void;
    /**
     * Sets an optional multiplicative color for the sprite.
     * @param color
     */
    setColor(color: ColorRepresentation): void;
    /**
     * Sets an optional fade color for the sprite.
     * @param fadeColor
     * @param fadeAmount
     */
    setFade(fadeColor: ColorRepresentation, fadeAmount: number): void;
    /**
     * Sets an optional opacity per layer, plus an optional default to apply to all others.
     * This is useful when sprites have multiple conditional layers.
     * @param opacityMap
     * @param defaultOpacity
     */
    setLayerOpacities(opacityMap: Partial<Record<LayerNames, number>>, defaultOpacity?: number): void;
    /**
     * Sets an optional multiplicative color per layer. This is useful for sprite recoloration.
     * @param colorMap
     */
    setLayerColors(colorMap: Partial<Record<LayerNames, ColorRepresentation>>): void;
    /**
     * Sets an optional fade color and amount per layer. This is useful for sprite recoloration.
     * @param colorMap
     */
    setLayerFades(colorMap: Partial<Record<LayerNames, [ColorRepresentation, number]>>): void;
    /**
     * Sets an optional outline on the sprite. Outlines expand the boundaries
     * of the sprite by a specified number of pixels with a specified color and opacity.
     *
     * When using this feature, ensure the sprite sheet has a padding equal or greater
     * than outlineWidth; otherwise, collisions with other frames will occur.
     * @param outlineWidth - width, in sprite-space pixels, of the outline.
     * @param outlineColor - color of the outline.
     * @param outlineOpacity - opacity of the outline.
     */
    setOutline(outlineWidth: number, outlineColor?: ColorRepresentation, outlineOpacity?: number): void;
}
