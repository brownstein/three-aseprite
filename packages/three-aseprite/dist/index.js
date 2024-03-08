"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThreeAseprite = exports.defaultTagName = exports.defaultLayerName = void 0;
const three_1 = require("three");
const aseprite_shader_material_1 = require("./aseprite-shader-material");
// Empty frame definition for internal use.
const emptyFrameDef = {
    frame: { x: 0, y: 0, w: 0, h: 0 },
    rotated: false,
    trimmed: true,
    spriteSourceSize: { x: 0, y: 0, w: 0, h: 0 },
    sourceSize: { w: 0, h: 0 },
    duration: 100
};
exports.defaultLayerName = "Default";
exports.defaultTagName = "Default";
/**
 * Three.js aseprite sprite renderer class.
 */
class ThreeAseprite extends three_1.EventDispatcher {
    constructor(options) {
        var _a, _b, _c, _d, _e, _f, _g;
        super();
        this.playingAnimation = true;
        this.playingBackwards = false;
        this.layerGroups = {};
        this.currentFrame = 0;
        this.frames = {};
        this.frameTime = 0;
        this.offset = new three_1.Vector2();
        this.emitByTagFrame = {};
        // Preserve options to allow easy cloning later.
        this.options = options;
        this.sourceJSON = options.sourceJSON;
        if (options.offset) {
            this.offset.x = options.offset.x;
            this.offset.y = options.offset.y;
        }
        const layerDepth = (_a = options.layerDepth) !== null && _a !== void 0 ? _a : 0.05;
        // Assign texture, size.
        this.texture = options.texture;
        // We assume that textures are loaded through Three.TextureLoaded
        // and contain references to images. Video textures not supported.
        this.textureWidth = this.texture.image.naturalWidth;
        this.textureHeight = this.texture.image.naturalHeight;
        // Extract layers from the sprite sheet definitions.
        if (options.layers) {
            this.orderedLayers = options.layers;
        }
        else if ((_c = (_b = options.sourceJSON.meta.layers) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0 > 0) {
            this.orderedLayers = [];
            for (const layerInfo of (_d = options.sourceJSON.meta.layers) !== null && _d !== void 0 ? _d : []) {
                if (layerInfo.opacity !== undefined) {
                    this.orderedLayers.push(layerInfo.name);
                }
                else {
                    if (!this.layerGroups[layerInfo.name])
                        this.layerGroups[layerInfo.name] = [];
                }
                if (layerInfo.group !== undefined) {
                    if (!this.layerGroups[layerInfo.group])
                        this.layerGroups[layerInfo.group] = [];
                    this.layerGroups[layerInfo.group].push(layerInfo.name);
                }
            }
        }
        else {
            this.orderedLayers = [exports.defaultLayerName];
        }
        // Extra frame tags from sprite sheet definitions.
        let frameTags = [];
        if ((_e = options.sourceJSON.meta.frameTags) === null || _e === void 0 ? void 0 : _e.length) {
            frameTags = options.sourceJSON.meta.frameTags;
        }
        else {
            frameTags.push({
                name: exports.defaultTagName,
                from: 0,
                to: Array.isArray(options.sourceJSON.frames)
                    ? options.sourceJSON.frames.length
                    : Object.keys(options.sourceJSON.frames).length,
                direction: "forward"
            });
        }
        this.currentTag = (_g = (_f = frameTags.at(0)) === null || _f === void 0 ? void 0 : _f.name) !== null && _g !== void 0 ? _g : exports.defaultTagName;
        // We want to support both object and array based source frames.
        const framesByFilename = Array.isArray(this.sourceJSON.frames)
            ? this.sourceJSON.frames.reduce((acc, frame) => {
                acc[frame.filename] = frame;
                return acc;
            }, {})
            : this.sourceJSON.frames;
        // For each tag, for each layer, store frame in lookup object.
        for (const frameTag of frameTags) {
            const tagName = frameTag.name;
            this.frames[tagName] = [];
            for (let i = frameTag.from; i <= frameTag.to; i++) {
                const frame = i;
                const tagFrame = i - frameTag.from;
                const frameSet = {};
                this.frames[tagName].push(frameSet);
                for (let li = 0; li < this.orderedLayers.length; li++) {
                    const layerName = this.orderedLayers[li];
                    const frameParams = { frame, tagFrame, tagName, layerName };
                    const frameKey = options.frameName(frameParams);
                    const frameDef = framesByFilename[frameKey];
                    if (frameDef)
                        frameSet[layerName] = frameDef;
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
        this.geometry = new three_1.BufferGeometry();
        this.geometry.setAttribute("position", new three_1.BufferAttribute(this.vtxPos, 3));
        this.geometry.setAttribute("uv", new three_1.BufferAttribute(this.vtxUV, 2));
        this.geometry.setAttribute("vtxOpacity", new three_1.BufferAttribute(this.vtxOpacity, 1));
        this.geometry.setAttribute("vtxColor", new three_1.BufferAttribute(this.vtxColor, 3));
        this.geometry.setAttribute("vtxFade", new three_1.BufferAttribute(this.vtxFade, 4));
        this.geometry.setIndex(new three_1.BufferAttribute(this.vtxIndex, 1));
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
        this.material = (0, aseprite_shader_material_1.createAspriteShaderMaterial)({
            texture: options.texture
        });
        // Create mesh.
        this.mesh = new three_1.Mesh(this.geometry, this.material);
        // Initialize geometry to default tag and frame.
        this.updateGeometryToTagFrame(this.currentTag, 0);
    }
    getFrame() {
        return this.currentFrame;
    }
    getTag() {
        return this.currentTag;
    }
    updateGeometryToTagFrame(tagName, frameNo) {
        var _a;
        const { textureWidth, textureHeight, offset, clipping, outlineSpread } = this;
        const { x: xOffset, y: yOffset } = offset;
        const invWidth = 1 / textureWidth;
        const invHeight = 1 / textureHeight;
        const tagDef = this.frames[tagName];
        if (tagDef === undefined)
            throw new Error(`[ThreeAseprite]: unknown tag "${tagName}".`);
        const frameDef = tagDef[frameNo % tagDef.length];
        if (frameDef === undefined)
            throw new Error(`[ThreeAseprite]: unknown frame "${tagName}#${frameNo}".`);
        for (let li = 0; li < this.orderedLayers.length; li++) {
            const layerName = this.orderedLayers[li];
            const layerFrameDef = (_a = frameDef[layerName]) !== null && _a !== void 0 ? _a : emptyFrameDef;
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
    expandLayerGroups(attrMap) {
        const assignments = {};
        const toAssign = [...Object.entries(attrMap)];
        while (toAssign.length > 0) {
            const assignment = toAssign.pop();
            if (assignment === undefined)
                break;
            const [layer, value] = assignment;
            assignments[layer] = value;
            if (this.layerGroups[layer]) {
                for (const subLayer of this.layerGroups[layer]) {
                    toAssign.push([subLayer, value]);
                }
            }
        }
        return assignments;
    }
    /**
     * Sets the sprite's opacity.
     * @param opacity
     */
    setOpacity(opacity) {
        this.material.uniforms.opacity.value = opacity;
        this.material.uniformsNeedUpdate = true;
    }
    /**
     * Sets an optional multiplicative color for the sprite.
     * @param color
     */
    setColor(color) {
        this.material.uniforms.color.value.set(color);
        this.material.uniformsNeedUpdate = true;
    }
    /**
     * Sets an optional fade color for the sprite.
     * @param fadeColor
     * @param fadeAmount
     */
    setFade(fadeColor, fadeAmount) {
        const color = new three_1.Color(fadeColor);
        const fade4 = this.material.uniforms.fade.value;
        fade4.set(color.r, color.g, color.b, fadeAmount);
        this.material.uniformsNeedUpdate = true;
    }
    /**
     * Sets an optional opacity per layer, plus an optional default to apply to all others.
     * This is useful when sprites have multiple conditional layers.
     * @param opacityMap
     * @param defaultOpacity
     */
    setLayerOpacities(opacityMap, defaultOpacity) {
        var _a;
        const opacityAssignments = this.expandLayerGroups(opacityMap);
        for (let li = 0; li < this.orderedLayers.length; li++) {
            const layerName = this.orderedLayers[li];
            const layerOpacity = (_a = opacityAssignments[layerName]) !== null && _a !== void 0 ? _a : defaultOpacity;
            if (layerOpacity === undefined)
                continue;
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
    setLayerColors(colorMap) {
        const colorAssignments = this.expandLayerGroups(colorMap);
        const color = new three_1.Color();
        for (let li = 0; li < this.orderedLayers.length; li++) {
            const layerName = this.orderedLayers[li];
            const colorAssignment = colorAssignments[layerName];
            if (colorAssignment === undefined)
                continue;
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
    setLayerFades(colorMap) {
        const fadeAssignments = this.expandLayerGroups(colorMap);
        const color = new three_1.Color();
        for (let li = 0; li < this.orderedLayers.length; li++) {
            const layerName = this.orderedLayers[li];
            const fade = fadeAssignments[layerName];
            if (fade === undefined)
                continue;
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
     * than outlineWidth; otherwise, collisions with other frames will occur.
     * @param outlineWidth - width, in sprite-space pixels, of the outline.
     * @param outlineColor - color of the outline.
     * @param outlineOpacity - opacity of the outline.
     */
    setOutline(outlineWidth, outlineColor, outlineOpacity) {
        const uOutlineSpread = this.material.uniforms.outlineSpread.value;
        const uOutline = this.material.uniforms.outline.value;
        if (outlineWidth > 0 && outlineColor !== undefined) {
            const outlineColorAsColor = new three_1.Color(outlineColor);
            this.outlineSpread = outlineWidth;
            uOutlineSpread.set(outlineWidth / this.textureWidth, outlineWidth / this.textureHeight);
            uOutline.set(outlineColorAsColor.r, outlineColorAsColor.g, outlineColorAsColor.b, outlineOpacity !== null && outlineOpacity !== void 0 ? outlineOpacity : 1);
        }
        else {
            this.outlineSpread = 0;
            uOutlineSpread.set(0, 0);
            uOutline.set(0, 0, 0, 0);
        }
        this.material.uniformsNeedUpdate = true;
    }
}
exports.ThreeAseprite = ThreeAseprite;
//# sourceMappingURL=index.js.map