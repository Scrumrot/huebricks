import { FPS, SCREEN_H } from "./core/constants";
import { loadSprites, type SpriteMap } from "./engine/assets";
import { AudioSystem } from "./engine/audio";
import { Clock } from "./engine/clock";
import { drawText, fillRoundRect, setDefaultFont } from "./engine/draw";
import { Input } from "./engine/input";
import { buildModernSprites, MODERN_COLORS } from "./engine/modernSkin";
import { buildBlockySprites } from "./engine/blockySkin";
import { buildSpectraSprites } from "./engine/spectraSkin";
import { buildDeliciousSprites } from "./engine/deliciousSkin";
import { buildBlankGlow, buildBlankShadow, buildClassicSoundButton } from "./engine/classicExtras";
import { loadGame, saveGame } from "./engine/save";
import { nextTheme, PALETTES, type ThemeName } from "./engine/theme";
import type { GameContext, Scene } from "./scenes/Scene";
import { TitleScene } from "./scenes/TitleScene";
import { fillScreen, PORTRAIT_W, view, type FullscreenControl } from "./engine/view";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const g = canvas.getContext("2d")!;
const loadingEl = document.getElementById("loading");

// --- canvas scaling ----------------------------------------------------------
// The canvas covers the window; engine/view.ts explains how logical units are
// chosen for each orientation. Scenes relayout themselves when view changes.
/** Touch targets stay at least this many CSS pixels on small screens. */
const MIN_HIT_CSS = 44;
const touchLandscape = window.matchMedia("(pointer: coarse) and (orientation: landscape)");

function resize(): void {
  const style = getComputedStyle(document.body);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const availW = Math.max(100, window.innerWidth - padX);
  const availH = Math.max(100, window.innerHeight - padY);
  const portrait = availH > availW;
  const scale = portrait ? availW / PORTRAIT_W : availH / SCREEN_H;
  view.scale = scale;
  view.w = availW / scale;
  view.h = availH / scale;
  view.portrait = portrait;
  // Up to 3x for high-density displays so chips and ink stay crisp.
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.style.width = `${availW}px`;
  canvas.style.height = `${availH}px`;
  canvas.width = Math.round(availW * dpr);
  canvas.height = Math.round(availH * dpr);
  g.setTransform(canvas.width / view.w, 0, 0, canvas.height / view.h, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  input.minHit = MIN_HIT_CSS / scale;
}

function toLogical(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * view.w,
    y: ((clientY - rect.top) / rect.height) * view.h,
  };
}

// --- fullscreen ----------------------------------------------------------------
// A toggle for the title screen and the F key; phones held sideways also ask
// for it on their first tap so the address bar goes away. Browsers without
// element fullscreen (iPhone Safari) just keep the edge-to-edge canvas.
// WebKit builds may expose the API only under the old webkit-prefixed names.
interface PrefixedDoc extends Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface PrefixedEl extends HTMLElement {
  webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void> | void;
}
const fsDoc = document as PrefixedDoc;
const fsEl = document.documentElement as PrefixedEl;

const fullscreen: FullscreenControl = {
  get supported() {
    if (typeof fsEl.requestFullscreen === "function") return document.fullscreenEnabled !== false;
    if (typeof fsEl.webkitRequestFullscreen === "function") return fsDoc.webkitFullscreenEnabled !== false;
    return false;
  },
  get active() {
    return (document.fullscreenElement ?? fsDoc.webkitFullscreenElement ?? null) !== null;
  },
  toggle() {
    if (!this.supported) return;
    try {
      if (this.active) {
        const exit = typeof document.exitFullscreen === "function" ? document.exitFullscreen() : fsDoc.webkitExitFullscreen?.();
        void Promise.resolve(exit).catch(() => undefined);
      } else {
        const opts: FullscreenOptions = { navigationUI: "hide" };
        const enter = typeof fsEl.requestFullscreen === "function" ? fsEl.requestFullscreen(opts) : fsEl.webkitRequestFullscreen?.(opts);
        void Promise.resolve(enter).catch(() => {
          // Not allowed here (no user activation, embedded page, ...): stay edge to edge.
        });
      }
    } catch {
      // Older WebKit throws synchronously instead of rejecting.
    }
  },
};
function autoFullscreen(): void {
  if (touchLandscape.matches && !fullscreen.active) fullscreen.toggle();
}
// pointerup (not pointerdown) is what counts as a user gesture for touch.
window.addEventListener("pointerup", autoFullscreen, { passive: true });
window.addEventListener("keydown", (e) => {
  if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) fullscreen.toggle();
});
document.addEventListener("fullscreenchange", resize);
document.addEventListener("webkitfullscreenchange", resize);

const audio = new AudioSystem();
const input = new Input(canvas, toLogical, () => audio.unlock());
const save = loadGame();
audio.muted = save.muted;
audio.setSfxVolume(save.sfx);
audio.setMusicVolume(save.music);
const clock = new Clock();

window.addEventListener("resize", resize);
touchLandscape.addEventListener("change", resize);
resize();

/** Loading screen: one paint chip cycling through the seven colours. */
const LOAD_COLORS = [1, 2, 3, 4, 5, 6, 7].map((c) => MODERN_COLORS[c as 1 | 2 | 3 | 4 | 5 | 6 | 7]);
function renderLoading(done: number, total: number): void {
  const pal = PALETTES.pigment;
  fillScreen(g, pal.background);
  const size = 64;
  const x = view.w / 2 - size / 2;
  const y = view.h / 2 - size / 2 - 10;
  const idx = Math.floor((performance.now() / 180) % LOAD_COLORS.length);
  fillRoundRect(g, x, y + 4, size, size, size * 0.18, "rgba(60,40,20,0.18)");
  fillRoundRect(g, x, y, size, size, size * 0.18, LOAD_COLORS[idx]);
  drawText(g, "HueBricks", view.w / 2, y + size + 34, { size: 22, color: pal.hudText, weight: 600, font: pal.display });
  const pct = total > 0 ? Math.round((100 * done) / total) : 0;
  drawText(g, `${pct}%`, view.w / 2, y + size + 60, { size: 13, color: pal.hudMuted, weight: 500, font: pal.font, tabular: true });
}

/** Wait for the web fonts (bounded, so an offline start is not delayed). */
async function waitForFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  const timeout = new Promise<void>((r) => setTimeout(r, 2000));
  const load = Promise.all([
    document.fonts.load('600 32px "Fredoka"'),
    document.fonts.load('700 16px "Inter"'),
    document.fonts.load('500 16px "Inter"'),
    document.fonts.load('700 32px "Outfit"'),
    document.fonts.load('700 32px "Space Grotesk"'),
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
    fillScreen(g, "#111");
    drawText(g, `Failed to load assets:\n${String(err)}`, view.w / 2, view.h / 2, { size: 16, color: "#f66" });
    throw err;
  }
  loading = false;
  sprites.sound_button_sprite = buildClassicSoundButton(sprites);
  sprites.brick_shadow_sprite = buildBlankShadow();
  sprites.brick_glow_sprite = buildBlankGlow();
  loadingEl?.remove();

  const classicSprites = sprites;
  const builders: Record<Exclude<ThemeName, "classic">, (c: SpriteMap) => SpriteMap> = {
    pigment: buildModernSprites,
    blocky: buildBlockySprites,
    spectra: buildSpectraSprites,
    delicious: buildDeliciousSprites,
  };
  const skins: Partial<Record<ThemeName, SpriteMap>> = { classic: classicSprites };

  let scene: Scene;
  const ctx: GameContext = {
    sprites,
    palette: PALETTES[save.theme] ?? PALETTES.pigment,
    audio,
    input,
    clock,
    view,
    fullscreen,
    save,
    session: { gameType: "normal", world: 1, level: 0, score: 0 },
    setScene(next: Scene) {
      scene = next;
      next.enter?.();
    },
    setTheme(theme: ThemeName) {
      if (theme !== "classic") skins[theme] ??= builders[theme](classicSprites);
      ctx.sprites = skins[theme]!;
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
  ctx.setTheme(save.theme);
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
      ctx.setTheme(nextTheme(save.theme));
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
