import { FPS, SCREEN_H, SCREEN_W } from "./core/constants";
import { loadSprites, type SpriteMap } from "./engine/assets";
import { AudioSystem } from "./engine/audio";
import { Clock } from "./engine/clock";
import { drawText, fillRoundRect, setDefaultFont } from "./engine/draw";
import { Input } from "./engine/input";
import { buildModernSprites, MODERN_COLORS } from "./engine/modernSkin";
import { buildClassicSoundButton } from "./engine/classicExtras";
import { loadGame, saveGame } from "./engine/save";
import { PALETTES, type ThemeName } from "./engine/theme";
import type { GameContext, Scene } from "./scenes/Scene";
import { TitleScene } from "./scenes/TitleScene";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const g = canvas.getContext("2d")!;
const loadingEl = document.getElementById("loading");

// --- canvas scaling: fixed 760 x 506.67 logical resolution, letterboxed ---
const view = { scale: 1 };
/** Touch targets stay at least this many CSS pixels on small screens. */
const MIN_HIT_CSS = 44;

function resize(): void {
  const style = getComputedStyle(document.body);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const availW = Math.max(100, window.innerWidth - padX);
  const availH = Math.max(100, window.innerHeight - padY);
  const scale = Math.min(availW / SCREEN_W, availH / SCREEN_H);
  const cssW = SCREEN_W * scale;
  const cssH = SCREEN_H * scale;
  // Up to 3x for high-density displays so chips and ink stay crisp.
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  g.setTransform(canvas.width / SCREEN_W, 0, 0, canvas.height / SCREEN_H, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  view.scale = scale;
  input.minHit = MIN_HIT_CSS / scale;
}

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
const clock = new Clock();

window.addEventListener("resize", resize);
resize();

/** Loading screen: one paint chip cycling through the seven colours. */
const LOAD_COLORS = [1, 2, 3, 4, 5, 6, 7].map((c) => MODERN_COLORS[c as 1 | 2 | 3 | 4 | 5 | 6 | 7]);
function renderLoading(done: number, total: number): void {
  const pal = PALETTES.modern;
  g.fillStyle = pal.background;
  g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const size = 64;
  const x = SCREEN_W / 2 - size / 2;
  const y = SCREEN_H / 2 - size / 2 - 10;
  const idx = Math.floor((performance.now() / 180) % LOAD_COLORS.length);
  fillRoundRect(g, x, y + 4, size, size, size * 0.18, "rgba(60,40,20,0.18)");
  fillRoundRect(g, x, y, size, size, size * 0.18, LOAD_COLORS[idx]);
  drawText(g, "HueBricks", SCREEN_W / 2, y + size + 34, { size: 22, color: pal.hudText, weight: 600, font: pal.display });
  const pct = total > 0 ? Math.round((100 * done) / total) : 0;
  drawText(g, `${pct}%`, SCREEN_W / 2, y + size + 60, { size: 13, color: pal.hudMuted, weight: 500, font: pal.font, tabular: true });
}

/** Wait for the web fonts (bounded, so an offline start is not delayed). */
async function waitForFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  const timeout = new Promise<void>((r) => setTimeout(r, 2000));
  const load = Promise.all([
    document.fonts.load('600 32px "Fredoka"'),
    document.fonts.load('700 16px "Inter"'),
    document.fonts.load('500 16px "Inter"'),
  ]).then(() => document.fonts.ready.then(() => undefined));
  await Promise.race([load, timeout]).catch(() => undefined);
}

function applyPageTheme(theme: ThemeName): void {
  const pal = PALETTES[theme];
  document.body.style.background = pal.background;
  document.body.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", pal.background);
}

async function boot(): Promise<void> {
  let loadDone = 0;
  let loadTotal = 1;
  let loading = true;
  const spin = (): void => {
    if (!loading) return;
    renderLoading(loadDone, loadTotal);
    requestAnimationFrame(spin);
  };
  spin();

  let sprites: SpriteMap;
  try {
    const [loaded] = await Promise.all([
      loadSprites((done, total) => {
        loadDone = done;
        loadTotal = total;
      }),
      waitForFonts(),
    ]);
    sprites = loaded;
  } catch (err) {
    loading = false;
    g.fillStyle = "#111";
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawText(g, `Failed to load assets:\n${String(err)}`, SCREEN_W / 2, SCREEN_H / 2, { size: 16, color: "#f66" });
    throw err;
  }
  loading = false;
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
    clock,
    view,
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
      applyPageTheme(theme);
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

  // Fixed 30 Hz simulation (the GameMaker room speed). Rendering happens on
  // every animation frame and interpolates sim-driven motion with
  // `clock.alpha`; the feel layer (tweens, particles) runs on game time.
  const STEP = 1000 / FPS;
  let last = performance.now();
  let acc = 0;
  let lastCursor = "";
  function frame(now: number): void {
    clock.advance(now);
    const wallDt = Math.min(250, now - last);
    last = now;
    if (!clock.frozen) acc += wallDt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      input.beginFrame();
      scene.update();
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
    clock.alpha = clock.frozen ? clock.alpha : Math.min(1, acc / STEP);
    scene.render(g);
    const cursor = scene.cursor?.() ?? "default";
    if (cursor !== lastCursor) {
      lastCursor = cursor;
      canvas.style.cursor = cursor;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void boot();
