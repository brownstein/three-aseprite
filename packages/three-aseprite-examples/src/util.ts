import { ThreeAseprite } from "three-aseprite";

export type LayerGroupTagInfo = [string[], string[], boolean[][]];

// Gets an ordered matrix of deer layers and tag presense.
export function getLayerGroupTagInfo(sprite: ThreeAseprite): LayerGroupTagInfo | null {
  const resultTags = Object.keys(sprite.getTags());
  const resultGroupKeys = Object.keys(sprite.getLayerGroups());
  if (resultGroupKeys.length === 0) return null;
  const resultMatrix: boolean[][] = [];
  for (const layerGroup of resultGroupKeys) {
    const row: boolean[] = [];
    for (const tagName of resultTags) {
      const hasResult = sprite.hasLayerAtTag(layerGroup, tagName, true);
      row.push(hasResult);
    }
    resultMatrix.push(row);
  }
  return [resultGroupKeys, resultTags, resultMatrix];
}
