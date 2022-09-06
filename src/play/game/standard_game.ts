import { Application, Container, IDestroyOptions } from "pixi.js";
import { Howl } from "howler";
import { MathUtils } from "osu-classes";

import {
  adaptiveScaleDisplayObject,
  OSU_PIXELS_PLAY_AREA_OFFSET,
  OSU_PIXELS_SCREEN_SIZE,
  VIRTUAL_SCREEN,
  VIRTUAL_SCREEN_MASK,
} from "../constants";

import { HitObjectTimeline } from "./hitobject_timeline";
import { StoryboardLayerTimeline } from "./storyboard_timeline";
import CursorAutoplay from "../render/standard/cursor_autoplay";
import { LoadedBeatmap } from "../loader/util";
import { StoryboardVideoPlayer } from "../render/common/storyboard_video";
import { SongProgressGraph } from "../render/common/song_progress_graph";
import { IPlayable } from "./timeline";

const GAME_MIN_RATE = 0.25;
const GAME_MAX_RATE = 3.00;

export class StandardGame extends Container implements IPlayable {
  private app: Application;

  private storyboardVideo: StoryboardVideoPlayer;
  private storyboardBackground: StoryboardLayerTimeline;
  private storyboardPass: StoryboardLayerTimeline;
  private storyboardForeground: StoryboardLayerTimeline;
  private storyboardOverlay: StoryboardLayerTimeline;
  private songProgressGraph: SongProgressGraph;
  private hitObjectTimeline: HitObjectTimeline;
  private cursorAutoplay: CursorAutoplay;

  private isAudioStarted = false;
  private audio: Howl;

  private gameContainer: Container;
  private isPaused = false;
  
  declare private timeElapsedMs: number;
  declare private lastTimeElapsedMs: number;
  private unfocusedTimeMs: number | null = null;
  private startTimeMs: number;
  private endTimeMs: number;
  private frameTimes: number[] = [];

  constructor(app: Application, beatmap: LoadedBeatmap) {
    super();

    (window as any).game = this;

    this.app = app;
    this.audio = beatmap.audio;

    VIRTUAL_SCREEN_MASK.setParent(this);
    this.mask = VIRTUAL_SCREEN_MASK;

    this.storyboardVideo = new StoryboardVideoPlayer(beatmap);
    this.storyboardBackground = new StoryboardLayerTimeline(
      beatmap,
      "Background"
    );
    this.storyboardPass = new StoryboardLayerTimeline(beatmap, "Pass");
    this.storyboardForeground = new StoryboardLayerTimeline(
      beatmap,
      "Foreground"
    );
    this.storyboardOverlay = new StoryboardLayerTimeline(beatmap, "Overlay");

    this.gameContainer = new Container();

    adaptiveScaleDisplayObject(
      VIRTUAL_SCREEN,
      OSU_PIXELS_SCREEN_SIZE,
      this.gameContainer
    );

    this.hitObjectTimeline = new HitObjectTimeline(beatmap.data);

    this.cursorAutoplay = new CursorAutoplay(beatmap.data.hitObjects);
    const cursorContainer = new Container();
    cursorContainer.addChild(this.cursorAutoplay);

    this.hitObjectTimeline.position.copyFrom(OSU_PIXELS_PLAY_AREA_OFFSET);
    cursorContainer.position.copyFrom(OSU_PIXELS_PLAY_AREA_OFFSET);

    this.songProgressGraph = new SongProgressGraph(beatmap);

    this.gameContainer.addChild(
      this.storyboardBackground,
      this.storyboardPass,
      this.storyboardForeground,
      this.hitObjectTimeline,
      this.storyboardOverlay,
      this.songProgressGraph,
      cursorContainer
    );

    this.addChild(this.storyboardVideo, this.gameContainer);

    this.interactive = true;
    this.interactiveChildren = true;

    const { earliestEventTime, latestEventTime } = beatmap.storyboard;

    // Some storyboards start before 0 ms.
    this.startTimeMs = Math.min(0, earliestEventTime ?? 0);

    // Compare storyboard, beatmap and audio length.
    this.endTimeMs = Math.max(
      this.audio.duration() * 1000, 
      Math.max(beatmap.data.totalLength, latestEventTime ?? 0)
    );

    this.timeElapsedMs = this.startTimeMs;

    document.addEventListener("visibilitychange", () => {
      if (!this.isPaused) {
        this.unfocusedTimeMs ??= Date.now();
      }
    });
    
    app.ticker.add(this.tick, this);

    this.seek();
    // this.seek(4500);
    // this.rate(1);
    // this.pause();

    this.addListener("pointerdown", (event) => {
      const onMouseMove = (event: any) => {
        const progress = event.data.global.x / event.currentTarget.width;

        this.seek(beatmap.data.hitObjects[0].startTime + beatmap.data.length * progress);
      };

      this.once("pointerup", () => {
        this.removeListener("pointermove", onMouseMove);
      });

      this.addListener("pointermove", onMouseMove);

      onMouseMove(event);
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === " " || event.code === "Space") { 
        this.isPaused ? this.play() : this.pause();
      }
    });
  }

  protected tick(): void {
    adaptiveScaleDisplayObject(this.app.screen, VIRTUAL_SCREEN, this);

    this.timeElapsedMs += this.getElapsedMs();

    if (this.lastTimeElapsedMs !== this.timeElapsedMs) {
      this.hitObjectTimeline.update(this.timeElapsedMs);
      this.cursorAutoplay.update(this.timeElapsedMs);
      this.storyboardVideo.update(this.timeElapsedMs);
      this.storyboardBackground.update(this.timeElapsedMs);
      this.storyboardPass.update(this.timeElapsedMs);
      this.storyboardForeground.update(this.timeElapsedMs);
      this.storyboardOverlay.update(this.timeElapsedMs);
      this.songProgressGraph.update(this.timeElapsedMs);
    }

    /**
     * 0 ms is the time at which audio should always start playing.
     * When audio ends it pauses itself and resets seek time to 0.
     * Use {@link isAudioStarted} to make sure we don't need to play the audio again.
     */
    if (!this.isPaused && !this.isAudioStarted && this.timeElapsedMs >= 0) {
      this.isAudioStarted = true;
      this.audio.play();
    }

    if (this.timeElapsedMs < this.endTimeMs) {
      if (!this.isPaused) {
        this.frameTimes.push(this.app.ticker.elapsedMS);
      }
    } else if (this.frameTimes.length > 0) {
      this.summarize();
    }

    this.lastTimeElapsedMs = this.timeElapsedMs;
  }

  protected getElapsedMs(): number {
    if (this.isPaused) return 0;

    if (this.unfocusedTimeMs === null) {
      // We use elapsedMs instead of deltaMs here to get uncapped value.
      return this.app.ticker.elapsedMS * this.app.ticker.speed;
    }

    const elapsedMs = Date.now() - this.unfocusedTimeMs;
    
    this.unfocusedTimeMs = null;

    return elapsedMs * this.app.ticker.speed;
  }

  public seek(timeMs?: number): void {
    const clampedTimeMs = MathUtils.clamp(
      timeMs ?? this.timeElapsedMs, 
      this.startTimeMs, 
      this.endTimeMs
    );

    this.timeElapsedMs = clampedTimeMs;

    const beforeAudioStart = clampedTimeMs < 0;
    const afterAudioEnd = clampedTimeMs >= this.audio.duration() * 1000;

    if (beforeAudioStart || afterAudioEnd) {
      this.isAudioStarted = afterAudioEnd;
      this.audio = this.audio.stop();
    }
    else {
      this.isAudioStarted = this.audio.seek() > 0;
      this.audio.seek(this.timeElapsedMs / 1000);
    }

    this.storyboardVideo.seek(clampedTimeMs);
    this.storyboardBackground.seek(clampedTimeMs);
    this.storyboardPass.seek(clampedTimeMs);
    this.storyboardForeground.seek(clampedTimeMs);
    this.storyboardOverlay.seek(clampedTimeMs);
  }

  public rate(rate: number): void {
    const clampedRate = MathUtils.clamp(rate, GAME_MIN_RATE, GAME_MAX_RATE);

    this.storyboardVideo.rate(clampedRate);
    this.storyboardBackground.rate(clampedRate);
    this.storyboardPass.rate(clampedRate);
    this.storyboardForeground.rate(clampedRate);
    this.storyboardOverlay.rate(clampedRate);

    this.audio.rate(clampedRate);
    this.app.ticker.speed = clampedRate;

    // Add extra audio seek to avoid possible sync problems.
    setTimeout(() => this.seek(this.timeElapsedMs));
  }

  public pause(): void {
    this.storyboardVideo.pause();
    this.storyboardBackground.pause();
    this.storyboardPass.pause();
    this.storyboardForeground.pause();
    this.storyboardOverlay.pause();

    if (this.audio.playing()) {
      this.audio = this.audio.pause();
    }

    this.isPaused = true;
  }

  public play(): void {
    this.storyboardVideo.play();
    this.storyboardBackground.play();
    this.storyboardPass.play();
    this.storyboardForeground.play();
    this.storyboardOverlay.play();

    // Play function should work as a repeat when the playback ends.
    if (this.timeElapsedMs >= this.endTimeMs) {
      this.timeElapsedMs = this.startTimeMs;
    }

    if (!this.audio.playing()) {
      this.isAudioStarted = true;
      this.audio.play();
    }

    this.isPaused = false;

    // Add extra audio seek to avoid possible sync problems.
    setTimeout(() => this.seek(this.timeElapsedMs));
  }

  public volume(volume: number): void {
    const clampedVolume = MathUtils.clamp01(volume);

    this.storyboardVideo.volume(clampedVolume);
    this.storyboardBackground.volume(clampedVolume);
    this.storyboardPass.volume(clampedVolume);
    this.storyboardForeground.volume(clampedVolume);
    this.storyboardOverlay.volume(clampedVolume);

    this.audio.volume(clampedVolume);
  }

  public summarize() {
    this.frameTimes.sort((a, b) => a - b);

    const totalFrames = this.frameTimes.length;

    console.log("Rendered", totalFrames, "frames");

    const Ps = [50, 90, 99, 99.9, 99.99];

    for (const P of Ps) {
      const frameTimeIndex = Math.floor((totalFrames * P) / 100);
      const frameTime = this.frameTimes[frameTimeIndex].toFixed(2);

      console.log(`P${P} ${frameTime}`);
    }

    const min = this.frameTimes[0] ?? 0;
    const max = this.frameTimes[this.frameTimes.length - 1] ?? 0;
    const mean = this.frameTimes.reduce((a, b) => a + b) / (totalFrames || 1);

    console.log("min", min.toFixed(2));
    console.log("max", max.toFixed(2));
    console.log("mean", mean.toFixed(2));

    // Empty array for next benchmark.
    this.frameTimes = [];
  }

  public destroy(options?: IDestroyOptions | boolean) {
    super.destroy(options);
    this.app.ticker.remove(this.tick, this);
  }
}
