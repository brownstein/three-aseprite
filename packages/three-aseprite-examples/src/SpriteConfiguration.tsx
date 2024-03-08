import { useEffect, useMemo, useState } from "react";
import { Color } from "three";
import { ThreeAseprite } from "three-aseprite";
import { getLayerGroupTagInfo } from "./util";

export type SpriteConfigurationProps = {
  sprite: ThreeAseprite;
};

const defaultConfig: {
  opacity: number;
  color: Color;
  fade: [Color, number],
  outline: [number, Color, number],
  layerGroupOpacity: Record<string, number> | null;
  tag: string | null;
} = {
  opacity: 1,
  color: new Color(0xffffff),
  fade: [new Color(0x000000), 0],
  outline: [0, new Color(), 1],
  layerGroupOpacity: null,
  tag: null,
};

export function SpriteConfiguration(props: SpriteConfigurationProps) {
  const { sprite } = props;
  const layerGroupTagInfo = useMemo(() => getLayerGroupTagInfo(sprite), [sprite]);
  const [config, setConfig] = useState(defaultConfig);

  useEffect(() => {
    setConfig(defaultConfig);
  }, [sprite]);

  useEffect(() => {
    sprite.setOpacity(config.opacity);
    sprite.setColor(config.color);
    sprite.setFade(...config.fade);
    sprite.setOutline(...config.outline);
    if (layerGroupTagInfo) {
      if (config.layerGroupOpacity) sprite.setLayerOpacities(config.layerGroupOpacity, 0);
      if (config.tag && sprite.getTags().find(t => t === config.tag)) sprite.currentTag = config.tag;
    }
  }, [sprite, config, layerGroupTagInfo]);

  const mainConfigSection = (
    <div>
      <h3>Sprite-Level Config</h3>
      <label className="config-line">
        <div>Opacity</div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={config.opacity}
          onChange={(e) => {
            setConfig((cfg) => ({ ...cfg, opacity: Number(e.target.value) }));
          }}
        />
      </label>
      <label className="config-line">
        <div>Color</div>
        <input
          type="color"
          value={`#${config.color.getHexString()}`}
          onChange={(e) => {
            setConfig((cfg) => ({ ...cfg, color: new Color(e.target.value )}));
          }}
        />
      </label>
      <label className="config-line">
        <div>Fade</div>
        <input
          type="color"
          value={`#${config.fade[0].getHexString()}`}
          onChange={(e) => {
            setConfig((cfg) => ({ ...cfg, fade: [new Color(e.target.value), cfg.fade[1]] }));
          }}
        />,
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={config.fade[1]}
          onChange={(e) => {
            setConfig((cfg) => ({ ...cfg, fade: [cfg.fade[0], Number(e.target.value)] }));
          }}
        />
      </label>
      <label className="confgi-line">
        <div>Outline</div>
        <input
          type="checkbox"
          checked={!!config.outline[0]}
          onChange={() => {
            setConfig((cfg) => ({ ...cfg, outline: [cfg.outline[0] > 0 ? 0 : 1, cfg.outline[1], cfg.outline[2]]}))
          }}
        />,
        <input
          type="color"
          value={`#${config.outline[1].getHexString()}`}
          onChange={(e) => {
            setConfig((cfg) => ({ ...cfg, outline: [cfg.outline[0], new Color(e.target.value), cfg.outline[2]] }));
          }}
        />,
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={config.outline[2]}
          onChange={(e) => {
            setConfig((cfg) => ({ ...cfg, outline: [cfg.outline[0], cfg.outline[1], Number(e.target.value)] }));
          }}
        />
     </label>
    </div>
  );

  let tagLayerConfiguration: React.ReactElement | null = null;
  if (layerGroupTagInfo) {
    tagLayerConfiguration = (
      <div>
        <h3>Tags / Layers</h3>
        <table>
          <thead>
            <tr>
              <td/>
              {layerGroupTagInfo[1].map((tagName) => (
                <td><div>{tagName}</div></td>
              ))}
            </tr>
          </thead>
          <tbody>
            {
              layerGroupTagInfo[0].map((layerName, layerIndex) => (
                <tr>
                  <td>{layerName}</td>
                  {layerGroupTagInfo[1].map((tagName, tagIndex) => (
                    <td>{layerGroupTagInfo[2][layerIndex][tagIndex]
                      ? (
                        <div
                          className="goto-layer-tag"
                          onClick={() => {
                            setConfig((cfg) => ({
                              ...cfg,
                              tag: tagName,
                              layerGroupOpacity: { [layerName]: 1 }
                            }));
                          }}
                        />
                      )
                      : null
                    }</td>
                  ))}
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="sprite-config">
      {mainConfigSection}
      {tagLayerConfiguration}
    </div>
  );
}