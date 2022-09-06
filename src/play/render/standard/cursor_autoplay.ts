import { IPointData } from "pixi.js";
import { MathUtils, Easing, BinarySearch } from "osu-classes";
import {
  Circle,
  Slider,
  Spinner,
  StandardHitObject,
} from "osu-standard-stable";
import { Cursor } from "./cursor";

const MAX_CLICK_PROPORTION = 0.5;
const MAX_CLICK_DURATION = 50;
const easingFunction = Easing.outQuad;

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
    for (
      this.nextHitObjectIndex = this.getNextHitObjectIndex(timeMs);
      this.nextHitObjectIndex < this.hitObjects.length &&
      this.hitObjects[this.nextHitObjectIndex].startTime <= timeMs;
      this.nextHitObjectIndex++
    );

    const nextHitObject = this.hitObjects[this.nextHitObjectIndex];

    if (this.nextHitObjectIndex == 0) {
      return { pos: nextHitObject.stackedStartPosition, expanded: false };
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
        const timeRelativeMs = timeMs - currentHitObject.startTime;
        const progress = timeRelativeMs / currentHitObject.duration;

        return {
          pos: currentHitObject.path
            .curvePositionAt(progress, currentHitObject.spans)
            .add(currentHitObject.stackedStartPosition),
          expanded: true,
        };
      }
      
      return {
        pos: currentHitObject.stackedEndPosition,
        expanded: true,
      };
    }
    
    if (nextHitObject) {
      let clickDuration = 0;

      if (!(currentHitObject instanceof Slider)) {
        clickDuration = Math.min(
          MAX_CLICK_DURATION,
          (nextHitObject.startTime - currentEndTime) * MAX_CLICK_PROPORTION
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

      // Between hit objects
      const progress = (timeMs - travelStart) / travelDuration;

      return {
        pos: MathUtils.lerpVector2(
          easingFunction(progress),
          currentHitObject.stackedEndPosition,
          nextHitObject.stackedStartPosition
        ),
        expanded: timeMs < clickEnd,
      };
    }

    // Song ended
    return {
      pos: currentHitObject.stackedEndPosition,
      expanded: false,
    };
  }

  update(timeMs: number) {
    const cursorState = this.getCursorState(timeMs);
    this.position.copyFrom(cursorState.pos);
    this.expanded = cursorState.expanded;

    super.update(timeMs);
  }

  private getNextHitObjectIndex(timeMs: number): number {
    const index = this.nextHitObjectIndex;

    if (index && timeMs >= this.hitObjects[index - 1].startTime) {
      return this.nextHitObjectIndex;
    }

    const found = BinarySearch
      .findIndex(this.hitObjects, (h) => timeMs < h.startTime);

    return found >= 0 ? found : 0;
  }
}
