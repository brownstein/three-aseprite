import React, { useEffect } from 'react';
// import logo from './logo.svg';
import './App.css';

import {
  NearestFilter,
  OrthographicCamera,
  Scene,
  TextureLoader,
  WebGLRenderer  
} from "three";
import GUI from "three/examples/jsm/libs/lil-gui.module.min";

import { ThreeAseprite, AsepriteJSON, InvertedFrameNameSpecifier } from "three-aseprite";

import deerPackedJSON from "./assets/deer-character-packed-hash.json";
import deerPackedPng from "./assets/deer-character-packed.png";
import deerSimpleJSON from "./assets/deer-character-idle-hash.json";
import deerSimplePng from "./assets/deer-character-idle.png";
import { SpriteConfiguration } from './SpriteConfiguration';

type SpriteInfo = {
  name: string;
  json: AsepriteJSON;
  textureUrl: string;
  defaultLayerOpacities?: Record<string, number>;
  defaultFrameOffset?: number;
};

const sprites: SpriteInfo[] = [
  {
    name: "Packed with tags + layers",
    json: deerPackedJSON,
    textureUrl: deerPackedPng,
    defaultLayerOpacities: {
      "Run": 1
    }
  },
  {
    name: "Simple frame sequence",
    json: deerSimpleJSON,
    textureUrl: deerSimplePng,
    defaultFrameOffset: 12
  }
];

type IState = {
  mounted?: boolean;
  scene?: Scene;
  sprite?: ThreeAseprite;
};

function App() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const iStateRef = React.useRef<IState>({});
  const [spriteConfig, setSpriteConfig] = React.useState<SpriteInfo>(sprites[0]);
  const [sprite, setSprite] = React.useState<ThreeAseprite | null>(null);

  // Set up rendering cycle.
  useEffect(() => {
    const iState = iStateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;
    iState.mounted = true;

    const renderer = new WebGLRenderer({
      canvas,
    });
    renderer.setClearColor(0x000000, 0);

    const camera = new OrthographicCamera(-32, 32, 32, -32, 0, 32);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, -1);

    const scene = new Scene();
    iState.scene = scene;
    let lastFrameTime = Date.now();

    const doFrame = () => {
      if (!mounted) return;
      const sprite = iState.sprite;
      if (sprite) {
        const now = Date.now();
        const timeDelta = now - lastFrameTime;
        lastFrameTime = now;

        sprite.animate(timeDelta);
      }

      renderer.render(scene, camera);
      requestAnimationFrame(doFrame);
    };

    doFrame();
    return () => {
      mounted = false;
      iState.mounted = false;
    };
  }, []);

  // Set up sprite.
  useEffect(() => {
    const iState = iStateRef.current;
    let mounted = true;

    const initSprite = async () => {
      const texture = await new TextureLoader().loadAsync(spriteConfig.textureUrl);
      if (!mounted) return;
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      const sourceJSON = spriteConfig.json;
      // Older frameName based method.
      // const frameName = !!spriteConfig.json.meta.layers
      //   ? ({ layerName, frame }: { layerName: string, frame: number}) => `(${layerName}) ${frame}`
      //   : undefined;
      const frameNameToFrameParams: InvertedFrameNameSpecifier | undefined = !!spriteConfig.json.meta.layers
        ? (rawName) => {
          const parts = /\((.+)\) (.+)/.exec(rawName);
          if (parts?.length !== 3) throw new Error("Invalid frame name conversion");
          return {
            layerName: parts[1],
            frame: Number(parts[2])
          };
        }
        : undefined;
      const sprite = new ThreeAseprite({
        texture,
        sourceJSON,
        frameNameToFrameParams
      });
      if (spriteConfig.defaultLayerOpacities) {
        sprite.setLayerOpacities(spriteConfig.defaultLayerOpacities, 0);
      }
      iState.sprite = sprite;
      iState.scene?.add(sprite.mesh);
      setSprite(sprite);
    };

    initSprite();

    return () => {
      mounted = false;
      if (iState.sprite && iState.scene) {
        iState.scene.remove(iState.sprite.mesh);
      }
    };
  }, [spriteConfig]);

  return (
    <div className="App">
      <header className="App-header">
        <canvas ref={canvasRef} width={200} height={200} />
        <p>
          Demo of <code className="App-link">three-aseprite</code> sprite rendering.
        </p>
      </header>
      <label className="sprite-selector">
        <div>Sprite Variant: </div>
        <select
          value={spriteConfig.name}
          onChange={(e) => {
            const cfg = sprites.find(s => s.name === e.target.value);
            if (!cfg) return;
            setSpriteConfig(cfg);
          }}
          >
            {sprites.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
        </select>
      </label>
      <div>
        { sprite && <SpriteConfiguration sprite={sprite} /> }
      </div>
    </div>
  );
}

export default App;
