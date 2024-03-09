import { ColorRepresentation, EventDispatcher, Mesh, Texture } from "three";
import { AsepriteJSON, AsepriteJSONFrameTag } from "./aseprite-export-types";
export * from "./aseprite-export-types";
export type IVector2 = {
    x: number;
    y: number;
};
export type FrameParams = {
    frame: number;
    layerName: string;
};
export type FrameNameSpecifier = (frameParams: FrameParams) => string;
export type ThreeAsepriteOptions<LayerName> = {
    texture: Texture;
    sourceJSON: AsepriteJSON;
    frameName?: FrameNameSpecifier;
    offset?: IVector2;
    layers?: LayerName[];
    layerDepth?: number;
};
type LayerGrouping = {
    [key: string]: string[];
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
    playingAnimationBackwards: boolean;
    readonly sourceJSON: AsepriteJSON;
    private frames;
    private tags;
    private orderedLayers;
    private layerGroups;
    private minFrame;
    private maxFrame;
    private currentFrame;
    private currentFrameTime;
    private currentTag;
    private currentTagFrame;
    private geometry;
    private material;
    private textureWidth;
    private textureHeight;
    private vtxIndex;
    private vtxPos;
    private vtxUV;
    private vtxOpacity;
    private vtxColor;
    private vtxFade;
    private offset;
    private options;
    private clipping?;
    private outlineSpread?;
    constructor(options: ThreeAsepriteOptions<LayerNames>);
    clone(): ThreeAseprite<LayerNames>;
    getCurrentFrame(): number;
    getFrameDuration(frameNumber: number): number;
    getCurrentFrameDuration(): number;
    getCurrentTag(): string | null;
    getCurrentTagFrame(): number | null;
    getCurrentTagFrameCount(): number | null;
    animate(deltaMs: number): void;
    gotoTag(tagName: string | null): void;
    gotoFrame(frameNo: number): void;
    gotoTagFrame(tagFrameNo: number): void;
    setClipping(clipping: LayerClipping | null): void;
    private updateGeometryToFrame;
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
     * than 2 * outlineWidth; otherwise, collisions with other frames will occur.
     * @param outlineWidth - width, in sprite-space pixels, of the outline.
     * @param outlineColor - color of the outline.
     * @param outlineOpacity - opacity of the outline.
     */
    setOutline(outlineWidth: number, outlineColor?: ColorRepresentation, outlineOpacity?: number): void;
    /**
     * Get available layers.
     * @returns
     */
    getLayers(): string[];
    /**
     * Get available layer groups.
     * @returns
     */
    getLayerGroups(): LayerGrouping;
    /**
     * Get available tags.
     * @returns
     */
    getTags(): Record<string, AsepriteJSONFrameTag>;
    /**
     * Determines whether a given layer of layer group is present within a given tag.
     * This is primairly used by the example to produce a clickable group/tag matrix.
     * @param layerOrGroupName
     * @param tagName
     * @param detectEmpty
     */
    hasLayerAtTag(layerOrGroupName: LayerNames, tagName: string, detectEmpty?: boolean): boolean;
}
