import React from 'react';
// import logo from './logo.svg';
import './App.css';

import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  Scene,
  TextureLoader,
  WebGLRenderer  
} from "three";

import { ThreeAseprite } from "three-aseprite";

import deerIdleJSON from "./assets/deer-character-idle-hash.json";
import deerIdlePng from "./assets/deer-character-idle.png";

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
      const frame = Math.floor((counter / 100) % 7);
      sprite?.updateGeometryToTagFrame("Default", frame);

      renderer.render(scene, camera);
      requestAnimationFrame(doFrame);
    };

    const init = async () => {
      const texture = await new TextureLoader().loadAsync(deerIdlePng);
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;

      sprite = new ThreeAseprite({
        texture,
        sourceJSON: deerIdleJSON,
        frameName: ({ frame }: { frame: number }) => `${ frame + 12 }`
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
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
