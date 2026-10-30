import type { ArcadeMode } from "../../core/arcade";
import type { GameContext, Scene } from "../Scene";
import { DrHueScene } from "./DrHueScene";
import { HueBobbleScene } from "./HueBobbleScene";
import { HueSwapScene } from "./HueSwapScene";
import { HueTristScene } from "./HueTristScene";

export function createArcadeScene(ctx: GameContext, mode: ArcadeMode): Scene {
  switch (mode) {
    case "bobble":
      return new HueBobbleScene(ctx);
    case "drhue":
      return new DrHueScene(ctx);
    case "trist":
      return new HueTristScene(ctx);
    case "swap":
      return new HueSwapScene(ctx);
  }
}
