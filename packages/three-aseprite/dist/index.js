"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThreeAseprite = void 0;
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
            this.orderedLayers = ["Default"];
        }
        // Extra frame tags from sprite sheet definitions.
        const frameTags = (_e = options.sourceJSON.meta.frameTags) !== null && _e !== void 0 ? _e : [];
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
        this.currentTag = (_g = (_f = frameTags.at(0)) === null || _f === void 0 ? void 0 : _f.name) !== null && _g !== void 0 ? _g : "Default";
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
        this.vtxFade = new Float32Array(16 * quadCount);
        this.geometry = new three_1.BufferGeometry();
        this.geometry.setAttribute("position", new three_1.BufferAttribute(this.vtxPos, 3));
        this.geometry.setAttribute("uv", new three_1.BufferAttribute(this.vtxUV, 2));
        this.geometry.setAttribute("vtxOpacity", new three_1.BufferAttribute(this.vtxOpacity, 1));
        this.geometry.setAttribute("vtxFade", new three_1.BufferAttribute(this.vtxFade, 4));
        this.geometry.setIndex(new three_1.BufferAttribute(this.vtxIndex, 1));
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
        this.material = (0, aseprite_shader_material_1.createAspriteShaderMaterial)({
            texture: options.texture
        });
        // Create mesh.
        this.mesh = new three_1.Mesh(this.geometry, this.material);
        // Initialize geometry to default tag and frame.
        this.updateGeometryToTagFrame(this.currentTag, 0);
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
        const frameDef = tagDef[frameNo];
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
exports.ThreeAseprite = ThreeAseprite;
//# sourceMappingURL=index.js.map