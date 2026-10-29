# HueBricks (browser remake)

A TypeScript + HTML5 Canvas remake of **HueBricks**, the colour-theory puzzle
game originally built in GameMaker Studio (see `../Huebricks.gmx`). The game
logic, timings, difficulty curve and art are ported directly from the GML
source; a second, modern visual theme is generated in code and can be toggled
at any time.

## Running it

```bash
npm install
npm run dev      # starts Vite and opens the game in your browser
npm run build    # type-checks and writes a static site to dist/
npm run preview  # serves the production build
npm test         # runs the core-logic unit tests (vitest)
```

The production `dist/` folder is fully static and can be dropped on any web
host (GitHub Pages, Netlify, an S3 bucket, ...). Paths are relative, so it also
works from a sub-folder.

## How to play

Bricks are colours made of three primaries (red, blue, yellow). Secondary
colours contain two primaries; "chromatic gray" (black) contains all three.

- Pick a brick from the **replenish line** under the board, then click a brick
  on the board to combine them: adding a colour that is not already present
  mixes it in; applying a colour that is contained subtracts it.
- When **four or more** connected bricks share a colour they pop.
- The replenish line fills up over time and then pushes a whole row onto the
  board. In **Normal** mode you lose if a brick is pushed off the top.
- **Puzzle**: clear the board. **Normal**: pop the required number of groups.
  **Zen**: like Normal, but you cannot lose.
- Rotate the board with the side buttons, hold the speed button to hurry the
  replenish line, and pause with the top button. The speaker button on the
  left rail toggles sound (it works during the tutorial too). Sound starts
  off; the gear on the title screen opens a Sound card with an on/off toggle
  and separate music and effects sliders.
- **Chain meter**: every scoring pop fills the meter and raises the
  multiplier (up to x5) for the next pop, as long as the meter has not
  drained. Cascades keep it full; big chains briefly slow the pops down.
- **Next bricks**: the next three replenish colours are ghosted in the empty
  slots of the line so you can plan a mix ahead.
- **Hold slot**: select a replenish brick and click the hold slot (or press
  `H`) to park it; click the slot again to pick it up. Only one brick can be
  held, and holding one swaps it with the brick already there.
- **Subtract goal**: a brick whose colour was reached by *subtracting* gets a
  star. Popping a group that contains one scores a bonus and counts toward
  the level's subtract goal; finishing the goal pays a further bonus.

Keyboard: `Q`/`←` rotate counter-clockwise, `E`/`→` rotate clockwise, hold
`Space`/`↓` to speed up, `H` hold / pick up, `P` pause, `Esc` back to the
title, `M` mute, `T` switch theme.

## Themes

Four themes, cycled with the pill in the top-right corner of the title or
the `T` key:

- **Spectra** (`src/engine/spectraSkin.ts`): glowing gel tiles on a
  near-black field. Each brick has an inner glow, a crisp inner edge and a
  soft outer bloom so same-colour groups read as one light; pops flare to
  white with additive glowing particles; the score and chain meter glow in
  the multiplier colour; the title is a spectrum wordmark over gel bricks
  floating up like bubbles. Display text is Space Grotesk.

- **Classic** uses the original sprite PNGs and sounds from the GameMaker
  project (`public/assets`).
- **Blocky** (`src/engine/blockySkin.ts`): soft 3D toy bricks with
  a flat top face and a darker extruded side, lit from the top-left. The
  extrusion is drawn live: it grows when a brick is lifted, squashes when it
  lands and collapses as a brick hops out of a pop. Dark flat backdrop with a
  dot grid, raised panels for the HUD rail and the replenish tray, and a
  staggered wall of hopping bricks on the title. Display text is Outfit.
- **Pigment** (default, `src/engine/modernSkin.ts`) rebuilds every sprite on
  offscreen canvases at start-up: thick paint chips with hand-cut
  edges on warm paper, ink glyphs in the same shape language as the original
  art (white on every chip), paper chip buttons and a "HueBricks" wordmark. Display text uses
  Fredoka and HUD text uses Inter, loaded from Google Fonts with system
  fallbacks when offline. The ten tutorial slides are redrawn too
  (`src/engine/modernSlides.ts`), with the same lesson order as the originals.

All themes share a real-time **feel layer**: the simulation still runs at
the original 30 Hz, but everything you see is interpolated or tweened at the
display's refresh rate. Pops have hit-stop, particles, a shockwave, screen
shake on big chains and rising score labels; bricks squash when they land,
the board turns as one piece with a small overshoot, combines wipe the new
colour in radially, invalid moves shake, buttons spring, and cards slide in.

The theme is remembered in `localStorage` together with the high score, the
furthest world reached, the mute setting and the two volume levels.

## Project layout

```
src/
  core/        pure game logic, no DOM (unit tested)
    color.ts     bitwise colour model and the combine rules
    Board.ts     grid, groups, popping, pushing, rotation, gravity
    Brick.ts     per-brick state and animation flags
    level.ts     difficulty curve per world/level
    layout.ts    board geometry
  engine/      browser plumbing
    assets.ts    sprite/audio manifest and loader
    audio.ts     Web Audio SFX + looping music
    input.ts     pointer/keyboard with per-frame edge detection
    draw.ts      sprite, text (tabular numerals), card and button helpers
    theme.ts     palettes, including card / button colours per theme
    easing.ts    easing vocabulary
    tween.ts     real-time tween manager
    particles.ts pooled particle system
    clock.ts     frame clock with hit-stop and sim interpolation
    buttonFeel.ts press / hover scale for buttons
    modernSkin.ts  generated "Pigment" sprite set and shared drawing helpers
    blockySkin.ts  generated "Blocky" sprite set
    spectraSkin.ts generated "Spectra" sprite set
    modernSlides.ts tutorial slides, drawn in whichever theme's style
    save.ts      localStorage persistence
  scenes/
    TitleScene.ts  logo -> mode -> world menus, credits, theme toggle
    GameScene.ts   gameplay state machine, replenish line, tutorial, pause
  main.ts      canvas scaling and the fixed 30 Hz loop
```

## Differences from the GameMaker version

- The title screen keeps the brick-wall look but uses plain buttons instead of
  the original brick-flip menu system.
- Multiple groups popping in one pass are all scored (the GML only counted the
  last one).
- Animations are retimed and rendered at display rate (see the feel layer
  above); the simulation and rules are unchanged.
- The high score is actually recorded, and the "Congratulations!" message in
  the tutorial stays on screen for a moment.
- New to this version: the chain meter and multiplier, the next-brick
  preview, the hold slot, refined bricks and the subtract bonus goal. The
  GML scoring formula is kept and the multiplier is applied on top of it.
- Replenish timer: it keeps running during board animations, a pop rewinds
  the current slot instead of banking a pause, using a brick no longer stalls
  it, and the push arms as soon as the line is full and fires after 60% of a
  period (the original waited two full periods).
- Items (bombs, colour subtract, randomize, colour shift) and the store were
  never wired into the original UI and are not included.
