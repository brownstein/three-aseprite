import {
	Color,
	DoubleSide,
	RawShaderMaterial,
	Texture,
	Vector2,
	Vector4,
} from "three";

export const asepriteShaderMaterialVertexShader = `
precision mediump float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float opacity;
uniform vec3 color;
uniform vec4 fade;
uniform vec2 outlineSpread;

attribute vec3 position;
attribute vec2 uv;
attribute vec3 vtxColor;
attribute vec4 vtxFade;
attribute float vtxOpacity;
attribute vec2 vtxOutlineSpread;

varying vec2 vUv;
varying vec3 vColor;
varying vec4 vFade;
varying float vOpacity;
varying vec2 vOutlineSpread;

void main() {
	vUv = uv;

	vColor = color * vtxColor;

	vFade = vec4(0.0, 0.0, 0.0, 0.0);
	if (fade.a > 0.0) vFade = fade;
	if (vtxFade.a > 0.0) vFade = vFade * ((vFade.a + vtxFade.a) - vtxFade.a) + vtxFade * vtxFade.a;
	
	vOpacity = vtxOpacity * opacity;

	// Support layer-specific outline sizes.
	vOutlineSpread = vec2(0.0, 0.0);
	vOutlineSpread += outlineSpread;
	vOutlineSpread *= vtxOutlineSpread;

	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const asepriteShaderMaterialFragmentShader = `
precision mediump float;

uniform sampler2D map;
uniform vec4 outline;

varying vec2 vUv;
varying vec3 vColor;
varying vec4 vFade;
varying float vOpacity;
varying vec2 vOutlineSpread;

void main() {
	vec4 color = texture2D(map, vUv);

	// Support material and vertex coloration.
	color.rgb = color.rgb * vColor;

	// Support fading to a color.
	if (vFade.a > 0.0) {
		color.rgb = color.rgb * (1.0 - vFade.a) + vFade.rgb * vFade.a;
	}
	
	// Support outlines.
	if (color.a < 1.0 && (vOutlineSpread.x > 0.0 || vOutlineSpread.y > 0.0)) {
		vec4 color1 = texture2D(map, vUv - vec2(vOutlineSpread.x, 0.0));
		vec4 color2 = texture2D(map, vUv + vec2(vOutlineSpread.x, 0.0));
		vec4 color3 = texture2D(map, vUv - vec2(0.0, vOutlineSpread.y));
		vec4 color4 = texture2D(map, vUv + vec2(0.0, vOutlineSpread.y));
		if (color1.a > color.a && color1.a > 0.5) {
			color = outline;
		}
		else if (color2.a > color.a && color2.a > 0.5) {
			color = outline;
		}
		else if (color3.a > color.a && color3.a > 0.5) {
			color = outline;
		}
		else if (color4.a > color.a && color4.a > 0.5) {
			color = outline;
		}
	}

	// Support opacity.
	color.a = color.a * vOpacity;

	// Discard at low opacity.
	if (color.a < 0.01) discard;
	gl_FragColor = color;
}
`;

export type AsepriteShaderMaterialProps = {
	texture: Texture;
};

/**
 * Creates a ShaderMaterial used to render sprites.
 * @param props - properties of the material.
 */
export function createAspriteShaderMaterial(props: AsepriteShaderMaterialProps) {
	return new RawShaderMaterial({
		vertexShader: asepriteShaderMaterialVertexShader,
		fragmentShader: asepriteShaderMaterialFragmentShader,
		uniforms: {
			map: {
				value: props.texture
			},
			opacity: {
				value: 1
			},
			outlineSpread: {
				value: new Vector2()
			},
			outline: {
				value: new Vector4()
			},
			color: {
				value: new Color(1, 1, 1)
			},
			fade: {
				value: new Vector4(0, 0, 0, 0)
			}
		},
		side: DoubleSide,
		transparent: true,
	});
}