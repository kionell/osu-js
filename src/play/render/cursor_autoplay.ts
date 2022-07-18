import {
  Circle,
  Slider,
  Spinner,
  StandardHitObject,
} from "osu-standard-stable";
import { Cursor } from "./cursor";
import { EasingFunctions, lerp2D } from "../anim";
import { IPointData } from "pixi.js";

const MAX_CLICK_PROPORTION = 0.5;
const MAX_CLICK_DURATION = 50;
const easingFunction = EasingFunctions.OutQuad;

interface CursorState {
  pos: IPointData;
  expanded: boolean;
}

export default class CursorAutoplay extends Cursor {
  private hitObjects: StandardHitObject[];

  private nextHitObjectIndex = 0;

  public constructor(hitObjects: StandardHitObject[]) {
    super();
    this.hitObjects = hitObjects;
  }

  getCursorState(timeMs: number): CursorState {
    while (
      this.nextHitObjectIndex < this.hitObjects.length - 1 &&
      this.hitObjects[this.nextHitObjectIndex].startTime <= timeMs
    ) {
      this.nextHitObjectIndex++;
    }

    const nextHitObject = this.hitObjects[this.nextHitObjectIndex];
    if (this.nextHitObjectIndex == 0) {
      return { pos: nextHitObject.startPosition, expanded: false };
    }

    const currentHitObject = this.hitObjects[this.nextHitObjectIndex - 1];

    let currentEndTime: number;

    if (
      currentHitObject instanceof Slider ||
      currentHitObject instanceof Spinner
    ) {
      currentEndTime = currentHitObject.endTime;
    } else if (currentHitObject instanceof Circle) {
      currentEndTime = currentHitObject.startTime;
    } else {
      console.warn("Unknown hit object", currentHitObject);
      currentEndTime = currentHitObject.startTime;
    }

    if (timeMs < currentEndTime) {
      // Within a hit object
      if (currentHitObject instanceof Slider) {
        const progress =
          (timeMs - currentHitObject.startTime) / currentHitObject.duration;
        return {
          pos: currentHitObject.path
            .curvePositionAt(progress, currentHitObject.spans)
            .add(currentHitObject.startPosition),
          expanded: true,
        };
      } else {
        return {
          pos: currentHitObject.endPosition,
          expanded: true,
        };
      }
    } else {
      let clickDuration;

      if (currentHitObject instanceof Slider) {
        clickDuration = 0;
      } else {
        clickDuration = Math.min(
          MAX_CLICK_DURATION,
          nextHitObject.startTime - currentEndTime
        );
      }
      const clickEnd = currentEndTime + clickDuration;

      const travelEnd = nextHitObject.startTime;

      // Don't move before a hit object is visible
      const travelDuration = Math.min(
        nextHitObject.timePreempt,
        travelEnd - currentEndTime
      );

      const travelStart = travelEnd - travelDuration;

      // between hit objects
      const progress = (timeMs - travelStart) / travelDuration;

      return {
        pos: lerp2D(
          easingFunction(progress),
          currentHitObject.endPosition,
          nextHitObject.startPosition
        ),
        expanded: timeMs < clickEnd,
      };
    }
  }

  update(timeMs: number) {
    const cursorState = this.getCursorState(timeMs);
    this.position.copyFrom(cursorState.pos);
    this.expanded = cursorState.expanded;

    super.update(timeMs);
  }
}
