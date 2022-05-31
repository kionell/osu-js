import { getScaledRect, POLICY } from "adaptive-scale/lib-esm";
import type { DisplayObject } from "pixi.js";

export interface Size {
  width: number;
  height: number;
}

export const TEXTURE_PIXELS_SCREEN_SIZE: Size = {
  width: 1366,
  height: 768,
};

export const OSU_PIXELS_SCREEN_SIZE: Size = {
  width: 640,
  height: 480,
};

export const OSU_PIXELS_PLAY_AREA_SIZE: Size = {
  width: 512,
  height: 384,
};

export const OSU_PIXELS_PLAY_AREA_OFFSET = {
  x: (OSU_PIXELS_SCREEN_SIZE.width - OSU_PIXELS_PLAY_AREA_SIZE.width) / 2,
  y: (OSU_PIXELS_SCREEN_SIZE.height - OSU_PIXELS_PLAY_AREA_SIZE.height) / 2,
};

export const OSU_HIT_OBJECT_RADIUS = 64;

export const diameterFromCs = (CS: number) => 54.4 - 4.48 * CS;

export function adaptiveScaleDisplayObject(
  containerSize: Size,
  targetSize: Size,
  object: DisplayObject,
  policy = POLICY.ShowAll
) {
  const scaled = getScaledRect({
    container: containerSize,
    target: targetSize,
    policy,
  });
  object.scale.set(
    scaled.width / targetSize.width,
    scaled.height / targetSize.height
  );
  object.x = scaled.x;
  object.y = scaled.y;
}
