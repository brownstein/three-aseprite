import React from 'react';
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

import { ThreeAseprite } from "three-aseprite";

import deerIdleJSON from "./assets/deer-character-idle-hash.json";
import deerIdlePng from "./assets/deer-character-idle.png";

import deerPackedJSON from "./assets/deer-character-packed-hash.json";
import deerPackedPng from "./assets/deer-character-packed.png";

type IState = {
  mounted?: boolean;
};

function App() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const iStateRef = React.useRef<IState>({});
  React.useEffect(() => {
    const iState = iStateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    iState.mounted = true;

    const renderer = new WebGLRenderer({
      canvas,
    });
    renderer.setClearColor(0x000000, 0);

    const camera = new OrthographicCamera(-32, 32, -32, 32, 0, 32);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, -1);

    const scene = new Scene();
    let sprite: ThreeAseprite | undefined;
    let lastFrameTime = Date.now();
    let counter = 0;

    const doFrame = () => {
      if (!iState.mounted) return;

      const now = Date.now();
      const timeDelta = now - lastFrameTime;
      lastFrameTime = now;

      counter += timeDelta;
      const frame = Math.floor((counter / 50) % 12);
      sprite?.updateGeometryToTagFrame("Run", frame);

      renderer.render(scene, camera);
      requestAnimationFrame(doFrame);
    };

    const init = async () => {
      const texture = await new TextureLoader().loadAsync(deerPackedPng);
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;

      sprite = new ThreeAseprite({
        texture,
        sourceJSON: deerPackedJSON,
        frameName: ({
          frame,
          layerName
        }) => `(${layerName}) ${frame}`
      });
      sprite.setLayerOpacities({
        "Run": 1,
      }, 0);
      sprite.setOutline(1, 0x000000);
      sprite.setLayerColors({
        "Run-Clothes": 0xaaeeff,
        "Run-Kilt": 0x99bbcc,
      });
      sprite.setLayerFades({
        "Run-Body": [0xffffff, 1]
      });

      scene.add(sprite.mesh);

      doFrame();
    };

    init();
    return () => {
      iState.mounted = false;
    };
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <canvas ref={canvasRef} width={200} height={200} />
        <p>
          Demo of <code>three-aseprite</code> sprite rendering.
        </p>
      </header>
    </div>
  );
}

export default App;
