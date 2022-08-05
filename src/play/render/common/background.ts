import { Sprite } from "pixi.js";
import { POLICY } from "../../adaptive-scale";
import { LoadedBeatmap } from "../../api/beatmap-loader";
import { adaptiveScaleDisplayObject, VIRTUAL_SCREEN } from "../../constants";

export class Background extends Sprite {
  constructor(beatmap: LoadedBeatmap) {
    super();

    // Dim by a fixed amount
    // TODO: Dim automatically
    this.tint = 0x333333;
    this.anchor.set(0.5);

    if (!beatmap.background) return;

    this.texture = beatmap.background;

  }
}
