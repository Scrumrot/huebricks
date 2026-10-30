/**
 * How a theme dresses the shared effects layer (`Effects`). Every switch
 * here is off for Classic so the original look and timing stay untouched;
 * the generated themes each pick the treatments that suit their material.
 */
export interface FxProfile {
  /** Popped bricks break into chunks of their own art before the debris flies. */
  fragments: boolean;
  /** Hot additive sparks on pops, starting at this colour and cooling to the brick colour; null for none. */
  sparks: string | null;
  /** Blurred glow pass over particles, fragments and rings (dark themes). */
  bloom: boolean;
  /** Edge-darkening pulse colour on level clears and big chains, or null. */
  vignette: string | null;
  /** A second, delayed ring on strong pops. */
  doubleRing: boolean;
  /** A touch of rotation in screen shake. */
  shakeRot: boolean;
  /** Brief slow motion on big chains. */
  slowmo: boolean;
  /** The popping brick flares white just before it bursts. */
  popFlash: boolean;
  /** Pop sound, hit-stop, flash and shake land on the burst frame rather than when the pop is decided. */
  stagedPop: boolean;
  /** Colour mixing: a hard radial wipe, a soft swirl with a highlight sweep, or a paper fold that flips the new colour over the old. */
  mix: "wipe" | "swirl" | "fold";
  /**
   * The material's own signature on a pop: a wet stain, a light flare, a
   * surface ripple, chunks that bounce on the shelf, or the whole tile
   * floating up and away.
   */
  signature: "none" | "splat" | "flare" | "ripple" | "bounce" | "float";
  /** Pop ring outline: a plain circle, or the popped colour's glyph (octagon, diamond, circle; nested for mixes). */
  ringShape: "circle" | "glyph";
  /** A short arc of the colour wheel around a mixing brick, from the old colour to the new, with the changed primary sliding along it. */
  mixArc: boolean;
  /** On the biggest pops the burst frame draws the board as flat ink on the popped colour for a couple of frames. */
  impactFrame: boolean;
  /** While a brick is selected, the group a drop would complete breathes together, joined by a faint line. */
  groupPreview: boolean;
}

/** Nothing on: the faithful port. */
export const CLASSIC_FX: FxProfile = {
  fragments: false,
  sparks: null,
  bloom: false,
  vignette: null,
  doubleRing: false,
  shakeRot: false,
  slowmo: false,
  popFlash: false,
  stagedPop: false,
  mix: "wipe",
  signature: "none",
  ringShape: "circle",
  mixArc: false,
  impactFrame: false,
  groupPreview: false,
};

/** Baseline for generated themes; each overrides what its material calls for. */
export const MODERN_FX: FxProfile = {
  fragments: true,
  sparks: null,
  bloom: false,
  vignette: null,
  doubleRing: true,
  shakeRot: true,
  slowmo: true,
  popFlash: true,
  stagedPop: true,
  mix: "swirl",
  signature: "bounce",
  ringShape: "glyph",
  mixArc: true,
  impactFrame: true,
  groupPreview: true,
};

export function fxProfile(overrides: Partial<FxProfile> = {}): FxProfile {
  return { ...MODERN_FX, ...overrides };
}
