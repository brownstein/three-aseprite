"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAspriteShaderMaterial = exports.asepriteShaderMaterialFragmentShader = exports.asepriteShaderMaterialVertexShader = void 0;
const three_1 = require("three");
exports.asepriteShaderMaterialVertexShader = `
precision mediump float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float opacity;
uniform vec4 fade;

attribute vec3 position;
attribute vec2 uv;
attribute vec4 vtxFade;
attribute float vtxOpacity;

varying vec2 vUv;
varying vec4 vFade;
varying float vOpacity;

void main() {
	vUv = uv;

	vFade = vec4(0.0, 0.0, 0.0, 0.0);
	if (fade.a > 0.0) vFade = fade;
	if (vtxFade.a > 0.0) vFade = vFade * ((vFade.a + vtxFade.a) - vtxFade.a) + vtxFade * vtxFade.a;
	
	vOpacity = vtxOpacity * opacity;

	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
exports.asepriteShaderMaterialFragmentShader = `
precision mediump float;

uniform sampler2D map;
uniform vec2 outlineSpread;
uniform vec4 outline;

varying vec2 vUv;
varying vec4 vFade;
varying float vOpacity;

void main() {
	vec4 color = texture2D(map, vUv);
	
	// Support outlines.
	if (color.a < 1.0 && (outlineSpread.x > 0.0 || outlineSpread.y > 0.0)) {
		vec4 color1 = texture2D(map, vUv - vec2(outlineSpread.x, 0.0));
		vec4 color2 = texture2D(map, vUv + vec2(outlineSpread.x, 0.0));
		vec4 color3 = texture2D(map, vUv - vec2(0.0, outlineSpread.y));
		vec4 color4 = texture2D(map, vUv + vec2(0.0, outlineSpread.y));
		if (color1.a > color.a) {
			color = outline;
		}
		else if (color2.a > color.a) {
			color = outline;
		}
		else if (color3.a > color.a) {
			color = outline;
		}
		else if (color4.a > color.a) {
			color = outline;
		}
	}
	
	// Support fading to a color.
	if (vFade.a > 0.0) {
		color.rgb = color.rgb * (1.0 - vFade.a) + vFade.rgb * vFade.a;
	}
	color.a = color.a * vOpacity;

	// Discard at low opacity.
	if (color.a < 0.01) discard;
	gl_FragColor = color;
}
`;
/**
 * Creates a ShaderMaterial used to render sprites.
 * @param props - properties of the material.
 */
function createAspriteShaderMaterial(props) {
    return new three_1.RawShaderMaterial({
        vertexShader: exports.asepriteShaderMaterialVertexShader,
        fragmentShader: exports.asepriteShaderMaterialFragmentShader,
        uniforms: {
            map: {
                value: props.texture
            },
            opacity: {
                value: 1
            },
            outlineSpread: {
                value: new three_1.Vector2()
            },
            outline: {
                value: new three_1.Vector4()
            }
        },
        side: three_1.DoubleSide,
        // transparent: true,
    });
}
exports.createAspriteShaderMaterial = createAspriteShaderMaterial;
//# sourceMappingURL=aseprite-shader-material.js.map