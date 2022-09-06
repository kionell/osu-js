import { Howl } from "howler";
import { StoryboardSample } from "osu-classes";
import { AudioTimelineInstance } from "../../game/timeline";

export class PlayableStoryboardSample implements AudioTimelineInstance {
  sample: StoryboardSample;
  sampleVolume: number;
  sound: Howl | null;
  soundId?: number;

  constructor(object: StoryboardSample, samples: Map<string, Howl>) {
    this.sound = samples.get(object.filePath) ?? null;
    this.sample = object;
    this.sampleVolume = object.volume / 100;

    if (!this.sound) return;

    this.soundId = this.sound.play();
    this.sound.volume(this.sampleVolume, this.soundId);
  }
}