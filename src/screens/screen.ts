import * as PIXI from "pixi.js";
import { Application } from "pixi.js";

export abstract class AbstractScreen {
  protected app: PIXI.Application;
  protected contianer: PIXI.Container;

  constructor(app: PIXI.Application) {
    this.app = app;
    this.app.ticker.add(this.tick, this);
    this.contianer = new PIXI.Container();
    this.app.stage.addChild(this.contianer);
  }

  public destroy() {
    this.app.ticker.remove(this.tick, this);
    this.app.stage.removeChild(this.contianer);
  }

  protected abstract tick(): void;
}

export class ScreenManager {
  private app: Application;
  private current: AbstractScreen | null = null;

  constructor(app: Application) {
    this.app = app;
  }

  public loadScreen(constructor: new (app: Application) => AbstractScreen){
    if(this.current){
      this.current.destroy();
    }
    this.current = new constructor(this.app);
  }
}
