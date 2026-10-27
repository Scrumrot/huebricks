import { FPS, SCREEN_H, SCREEN_W } from "./core/constants";
import { loadSprites, type SpriteMap } from "./engine/assets";
import { AudioSystem } from "./engine/audio";
import { drawText, setDefaultFont } from "./engine/draw";
import { Input } from "./engine/input";
import { buildModernSprites } from "./engine/modernSkin";
import { buildClassicSoundButton } from "./engine/classicExtras";
import { loadGame, saveGame } from "./engine/save";
import { PALETTES, type ThemeName } from "./engine/theme";
import type { GameContext, Scene } from "./scenes/Scene";
import { TitleScene } from "./scenes/TitleScene";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const g = canvas.getContext("2d")!;
const loadingEl = document.getElementById("loading");

// --- canvas scaling: fixed 760 x 506.67 logical resolution, letterboxed ---
let cssW = SCREEN_W;
let cssH = SCREEN_H;
function resize(): void {
  const scale = Math.min(window.innerWidth / SCREEN_W, window.innerHeight / SCREEN_H);
  cssW = SCREEN_W * scale;
  cssH = SCREEN_H * scale;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  g.setTransform(canvas.width / SCREEN_W, 0, 0, canvas.height / SCREEN_H, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
}
window.addEventListener("resize", resize);
resize();

function toLogical(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * SCREEN_W,
    y: ((clientY - rect.top) / rect.height) * SCREEN_H,
  };
}

const audio = new AudioSystem();
const input = new Input(canvas, toLogical, () => audio.unlock());
const save = loadGame();
audio.muted = save.muted;

function renderLoading(done: number, total: number): void {
  g.fillStyle = "#111";
  g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const w = SCREEN_W / 2;
  const x = SCREEN_W / 4;
  const y = SCREEN_H / 2;
  g.fillStyle = "#333";
  g.fillRect(x, y, w, 8);
  g.fillStyle = "#e33";
  g.fillRect(x, y, (w * done) / Math.max(1, total), 8);
  drawText(g, "Loading HueBricks", SCREEN_W / 2, y - 24, { size: 18, color: "#ccc" });
}

async function boot(): Promise<void> {
  renderLoading(0, 1);
  let sprites: SpriteMap;
  try {
    sprites = await loadSprites((done, total) => renderLoading(done, total));
  } catch (err) {
    g.fillStyle = "#111";
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawText(g, `Failed to load assets:\n${String(err)}`, SCREEN_W / 2, SCREEN_H / 2, { size: 16, color: "#f66" });
    throw err;
  }
  sprites.sound_button_sprite = buildClassicSoundButton(sprites);
  loadingEl?.remove();

  const classicSprites = sprites;
  let modernSprites: SpriteMap | null = null;

  let scene: Scene;
  const ctx: GameContext = {
    sprites,
    palette: PALETTES[save.theme] ?? PALETTES.modern,
    audio,
    input,
    save,
    session: { gameType: "normal", world: 1, level: 0, score: 0 },
    setScene(next: Scene) {
      scene = next;
      next.enter?.();
    },
    setTheme(theme: ThemeName) {
      if (theme === "modern") {
        modernSprites ??= buildModernSprites(classicSprites);
        ctx.sprites = modernSprites;
      } else {
        ctx.sprites = classicSprites;
      }
      ctx.palette = PALETTES[theme];
      setDefaultFont(ctx.palette.font);
      save.theme = theme;
      saveGame(save);
    },
    persist() {
      saveGame(save);
    },
  };
  ctx.setTheme(save.theme === "classic" ? "classic" : "modern");
  scene = new TitleScene(ctx);
  scene.enter?.();

  if (import.meta.env.DEV) {
    // Debug handle for poking at the running game from the console.
    (window as unknown as { __huebricks: unknown }).__huebricks = {
      ctx,
      get scene() {
        return scene;
      },
    };
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "m" || e.key === "M") {
      save.muted = audio.toggleMute();
      saveGame(save);
    }
    if (e.key === "t" || e.key === "T") {
      ctx.setTheme(save.theme === "modern" ? "classic" : "modern");
    }
  });

  // Fixed 30 Hz simulation (the GameMaker room speed) with rendering on every
  // animation frame.
  const STEP = 1000 / FPS;
  let last = performance.now();
  let acc = 0;
  function frame(now: number): void {
    acc += Math.min(250, now - last);
    last = now;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      input.beginFrame();
      scene.update();
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
    scene.render(g);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void boot();
