import { Container, DisplayObject } from "pixi.js";
import { BinarySearch, StoryboardSample } from "osu-classes";
import { Howl } from "howler";

export interface IUpdatable {
  update(timeMs: number): void;
}

export interface IPlayable {
  play(): void;
  pause(): void;
  seek(timeMs: number): void;
  rate(rate: number): void;
  volume(volume: number): void;
}

export interface IDurable {
  startTimeMs: number;
  endTimeMs: number;
}

export interface TimelineElement<Instance> extends IDurable {
  build: () => Instance;
}

interface TimelineElementState<Instance> extends IDurable {
  instance: Instance;
}

interface TimelineOptions<Instance> {
  elements: TimelineElement<Instance>[],
  createElement?: TimelineCallback<Instance>,
  updateElement?: TimelineCallback<Instance>,
  destroyElement?: TimelineCallback<Instance>,
  allowSkippingElements?: boolean
}

type TimelineCallback<Instance> = (instance: Instance, timeMs: number) => void;

export class Timeline<Instance> implements IUpdatable {
  readonly elements: TimelineElement<Instance>[];
  readonly activeElements = new Map<number, TimelineElementState<Instance>>();

  declare private lastTimeMs: number;
  declare private nextElementIndex: number;
  
  private createElement: TimelineCallback<Instance> | null;
  private updateElement: TimelineCallback<Instance> | null;
  private destroyElement: TimelineCallback<Instance> | null;
  private allowSkippingElements: boolean;

  public constructor(options: TimelineOptions<Instance>) {
    this.elements = options.elements
      .slice()
      .sort((a, b) => a.startTimeMs - b.startTimeMs);

    this.createElement = options.createElement ?? null;
    this.updateElement = options.updateElement ?? null;
    this.destroyElement = options.destroyElement ?? null;
    this.allowSkippingElements = options.allowSkippingElements ?? false;
  }

  public update(timeMs: number, forward = true) {
    this.nextElementIndex ??= (forward ? 0 : this.elements.length - 1);

    for (
      this.setInitialElementIndex(timeMs, forward);
      this.shouldAddNextElement(timeMs, forward);
      this.setNextElementIndex(forward)
    ) {
      const nextElement = this.elements[this.nextElementIndex];
      const hasEnded = timeMs >= nextElement.endTimeMs;
      const isActive = this.activeElements.has(this.nextElementIndex);

      if (!this.allowSkippingElements || (!hasEnded && !isActive)) {
        const nextElementState: TimelineElementState<Instance> = {
          startTimeMs: nextElement.startTimeMs,
          endTimeMs: nextElement.endTimeMs,
          instance: nextElement.build(),
        };

        this.createElement?.(nextElementState.instance, timeMs);
        this.activeElements.set(this.nextElementIndex, nextElementState);
      }
    }

    for (const [ index, element ] of this.activeElements) {
      if (timeMs >= element.startTimeMs && timeMs < element.endTimeMs) {
        this.updateElement?.(element.instance, timeMs);
      } else {
        this.destroyElement?.(element.instance, timeMs);
        this.activeElements.delete(index);
      }
    }

    this.lastTimeMs = timeMs;
  }

  private setInitialElementIndex(timeMs: number, forward: boolean): void {
    const nextElement = this.elements[this.nextElementIndex];

    const isSeekingBackwards = forward 
      ? timeMs < this.lastTimeMs 
      : timeMs > this.lastTimeMs;

    const isSeekingForward = forward 
      ? timeMs >= nextElement?.endTimeMs
      : timeMs <= nextElement?.startTimeMs;

    if (!isSeekingBackwards && !isSeekingForward && nextElement) {
      return;
    }

    const found = BinarySearch.findIndex(this.elements, (element) => {
      return forward 
        ? timeMs < element.endTimeMs 
        : timeMs > element.startTimeMs;
    });

    this.nextElementIndex = forward ? (found >= 0 ? found : 0) : found;
  }

  private shouldAddNextElement(timeMs: number, forward: boolean): boolean {
    const elementExists = forward 
      ? this.nextElementIndex < this.elements.length
      : this.nextElementIndex >= 0;
    
    if (!elementExists) return false;
    
    return forward 
      ? timeMs > this.elements[this.nextElementIndex].startTimeMs
      : timeMs < this.elements[this.nextElementIndex].endTimeMs;
  }

  private setNextElementIndex(forward: boolean): void {
    this.nextElementIndex += (forward ? 1 : -1);
  }
}

export type DOTimelineInstance = DisplayObject & IUpdatable;

export class DisplayObjectTimeline extends Container implements IUpdatable {
  private timeline: Timeline<DOTimelineInstance>;

  public constructor(elements: TimelineElement<DOTimelineInstance>[]) {
    super();
    this.timeline = new Timeline({
      createElement: this.createElement,
      updateElement: this.updateElement,
      destroyElement: this.destroyElement,
      allowSkippingElements: true,
      elements,
    });
  }

  private createElement: TimelineCallback<DOTimelineInstance> = (instance) => {
    this.addChildAt(instance, 0);
  };

  private updateElement: TimelineCallback<DOTimelineInstance> = (
    instance,
    timeMs
  ) => {
    instance.update(timeMs);
  };

  private destroyElement: TimelineCallback<DOTimelineInstance> = (instance) => {
    instance.destroy({ children: true });
    this.removeChild(instance);
  };

  public update(timeMs: number) {
    this.timeline.update(timeMs);
  }
}

export interface AudioTimelineInstance {
  sample: StoryboardSample;
  sampleVolume: number;
  sound: Howl | null;
  soundId?: number;
};

export class AudioObjectTimeline implements IUpdatable, IPlayable {
  private timeline: Timeline<AudioTimelineInstance>;
  private lastTimeMs = 0;

  constructor(elements: TimelineElement<AudioTimelineInstance>[]) {
    this.timeline = new Timeline({
      destroyElement: this.destroyElement,
      allowSkippingElements: true,
      elements, 
    });
  }

  private destroyElement: TimelineCallback<AudioTimelineInstance> = (instance) => {
    instance.sound?.stop(instance.soundId);
  };

  public update(timeMs: number) {
    this.timeline.update(timeMs);
    this.lastTimeMs = timeMs;
  }

  public play(): void {
    this.timeline.activeElements.forEach((element) => {
      element.instance.sound?.play(element.instance.soundId);
    });
  }

  public pause(): void {
    this.timeline.activeElements.forEach((element) => {
      element.instance.sound?.pause(element.instance.soundId);
    });
  }

  public seek(timeMs: number): void {
    this.timeline.activeElements.forEach((element) => {
      if (!element.instance.sound) return;
      
      const { sound, soundId, sample } = element.instance;

      const timeRelativeMs = timeMs - sample.startTime;
      const seekOffsetMs = timeMs - this.lastTimeMs;

      const seekTimeMs = timeRelativeMs + seekOffsetMs;

      const sampleDurationMs = sound.duration(soundId) * 1000;
      const sampleEndTimeMs = sample.startTime + sampleDurationMs;

      sound.seek(seekTimeMs / 1000, soundId);

      if (seekTimeMs < 0 || seekTimeMs >= sampleEndTimeMs) {
        if (sound.playing(soundId)) sound.stop(soundId);
      } else if (Math.abs(timeMs - this.lastTimeMs) > 20) {
        sound.seek(seekTimeMs / 1000, soundId);
      }
    });
  }
  
  public rate(rate: number): void {
    this.timeline.activeElements.forEach((element) => {
      element.instance.sound?.rate(rate);
    });
  }

  public volume(volume: number): void {
    this.timeline.activeElements.forEach((element) => {
      element.instance.sound?.volume(element.instance.sampleVolume * volume);
    })
  }
}
