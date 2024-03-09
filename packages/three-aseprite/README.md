# three-aseprite
## A utility for rendering sprite sheet exports from Aseprite in Three.js

Aseprite is a powerful sprite editor which features support for multiple frames, layers, and collections of frames called tags. It can export animations as sprite sheets with JSON metadata, and this module exists to reassemble
those sprite sheets into game-ready sprites with a variety of bells and whistles.

## Demo
Here's [a deployed demo](https://brownstein.github.io/three-aseprite/) with some of the advanced features exposed.

## Features
- Handles sprite sheets with multiple layers and tags.
- Supports time delta based animation, forwards and backwards.
- Supports opacity, multiplicative recoloration, and fading.
- Supports dynamic outlining.
- Supports adding event handlers to specific frames.
- Supports layer groups.
- Type support can enforce layer name parameters and events.

## Basic Usage
```typescript
  import { NearestFilter, TextureLoader } from "three";
  import { ThreeAseprite } from "three-aseprite";

  import yourTexture from "./your-texture.png";
  import yourJSON from "./your-json-metadata.json";

  async function loadYourSprite() {
    // Load your texture.
    const texture = await new TextureLoader().loadAsync(yourTexture);
    // Ensure pixels are crisp (optional).
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    // Instantiate your sprite.
    return new ThreeAseprite({
      texture,
      sourceJSON: yourJSON
    })
  }
```

## Usage with optional types and a frame name mapping function
```typescript
  import { NearestFilter, TextureLoader } from "three";
  import { ThreeAseprite } from "three-aseprite";

  import yourTexture from "./your-texture.png";
  import yourJSON from "./your-json-metadata.json";

  type YourLayers = "A Layer" | "Another Layer";
  type YourEvents = "An Event" | "Another Event";

  async function loadYourSprite() {
    // Load your texture.
    const texture = await new TextureLoader().loadAsync(yourTexture);
    // Ensure pixels are crisp (optional).
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    // Instantiate your sprite.
    return new ThreeAseprite<YourLayers, YourEvents>({
      texture,
      sourceJSON: yourJSON,
      // Supply a frame name mapping function to map from layer and frame to the filename field.
      frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
    });
  }
```