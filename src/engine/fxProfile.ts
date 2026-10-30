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
  /** Colour mixing: a hard radial wipe or a soft swirl with a highlight sweep. */
  mix: "wipe" | "swirl";
  /** The material's own signature on a pop: a wet stain, a light flare, a surface ripple or chunks that bounce on the shelf. */
  signature: "none" | "splat" | "flare" | "ripple" | "bounce";
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
};

export function fxProfile(overrides: Partial<FxProfile> = {}): FxProfile {
  return { ...MODERN_FX, ...overrides };
}
