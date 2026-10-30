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
npm test         # runs the unit and scene tests (vitest)
npm run lint     # eslint (typescript-eslint, prettier-compatible)
npm run format   # prettier --write
npm run check    # typecheck + lint + format check + tests, what CI runs
```

The production `dist/` folder is fully static and can be dropped on any web
host (GitHub Pages, Netlify, an S3 bucket, ...). Paths are relative, so it also
works from a sub-folder.

### Screen sizes

The canvas fills the browser window and the layout adapts to its shape. Sideways
(landscape) the HUD sits in columns either side of the board, as in the original;
on wider windows the columns hug the board and the paper backdrop fills the rest,
and on squarer windows the board shrinks so the columns keep their room. Upright
(portrait) the game stacks: score, level and pops above the board, hold slot,
sound and the board controls below it, and the title menus stack their buttons.
The Classic theme keeps its side rails in every orientation.

On a phone held sideways the first tap asks the browser for fullscreen so the
address bar goes away. The title screen also has a fullscreen toggle (or press
F), which works on desktop browsers and Android; Safari on iPhone has no element
fullscreen, so the toggle hides itself there and adding the page to the home
screen is the way to lose the bar.

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
- **Subtract goal**: a brick whose colour was reached by _subtracting_ gets a
  star. Popping a group that contains one scores a bonus and counts toward
  the level's subtract goal; finishing the goal pays a further bonus.

Keyboard: `Q`/`←` rotate counter-clockwise, `E`/`→` rotate clockwise, hold
`Space`/`↓` to speed up, `H` hold / pick up, `P` or `Esc` pause (Esc also
steps back out of the pause card's pages), `M` mute, `T` switch theme. The
pause card shows these as keycaps once a key has been used in the run.

The pause card holds Resume, Restart level (back to the score the level
began with), Quit to title (asks once), a strip of theme swatches with an
"All" grid, the sound toggle and sliders, and a `?` that opens the
how-to-play slides without leaving the run. The HUD's chain meter carries
the multiplier as a badge, and the level pill starts with the mode's brick
glyph (red octagon Puzzle, blue diamond Normal, yellow circle Zen), which
the title's Continue chip uses too.

On the modern title screen a Play pill opens the modes and a Continue chip
resumes Normal at the furthest world reached; the bottom bar shows the high
score, furthest world and arcade best; the top-right cluster is the theme
pill (opens a picker of every theme), the speaker and fullscreen. The gear
opens Settings: sound, plus a **Reduce motion** toggle that halves shake,
hit-stop and debris and skips slow motion. Classic keeps the original title.

Smaller touches: resting bricks breathe on a slow stagger, a picked-up
brick carries a pulsing halo in its colour, each theme pops into its own
debris (paint splats, sprinkles, gem shards, bats, snowflakes, confetti),
and a level clear sends a fountain of it up the board while the backdrop
reacts (lights flare, snow flurries, the moon brightens).

The title screen plays along too: tap anywhere on the backdrop and a wave
spreads from the point, flipping every chip, gem or wall brick to a new
colour as it arrives (the original's menu wall did this); chips lift under
the cursor and shift with it, bubbles drift aside, snow swirls, bats veer
away and bulbs brighten near the pointer.

## Arcade

The mode menu has a fourth button, **Arcade**, which opens a grid of
score-attack games built on the same colour rules. Each has a how-to-play
card on its first screen, a pause card (with the theme switch), on-screen
touch controls, and its own best score. Three so far:

- **Hue Bobble** (Puzzle Bobble): aim the launcher with the mouse or a
  drag, click / tap / `Space` to shoot. A shot that can mix with the bubble
  it hits mixes in and recolours it; a shot that cannot mix sticks beside it.
  Three or more of a colour pop, anything left hanging falls for a bonus,
  and the ceiling comes down a row every few shots. Clear the cluster to go
  up a level.
- **Dr. Hue** (Dr. Mario): the well starts with locked _stains_ in its lower
  half. Dominoes fall from the top (`←`/`→` move, `↑`/`Z`/`X` or tap rotate,
  `↓` soft drop, `Space` or a swipe down hard drops). A half that lands on a
  stain mixes into it, which is how an unreachable orange stain becomes a red
  you can line up; four in a line, stains included, clears. Clear every stain
  to finish the level. There is no hand-authored puzzle file in this project,
  so the forty layouts are generated from a seed per level and grow with it.
- **Hue Trist** (Tetris-ish): a single brick falls down a seven-wide well.
  Land on a brick it can mix with and the two become one new colour (the
  ghost shows the result); land anywhere else and it stacks. Four or more
  touching pop, the stack falls and chains, and the drops speed up as you go.
- **Hue Swap** (match-3-ish): a full seven-by-eight board. Tap a tile, then a
  neighbour: if the two can mix, the first pours into the second and the gap
  fills from above; if they cannot, they trade places. Four or more touching
  pop and the board cascades. A clock drains while you think (not while the
  board resolves), every pop puts time back, chains more so, and the drain
  quickens with each level. Drag a tile towards a neighbour to act in one
  gesture, or use the arrow keys and Space.

## Themes

Switch themes any time: the theme pill in the top-right of the title screen
opens a picker, the pause card has a swatch strip and an "All" grid, and the
`T` key cycles. The choice is remembered.

Fifteen themes:

- **Delicious** (`src/engine/deliciousSkin.ts`): frosted tarts with fluted
  crusts, piped-icing glyphs and sprinkles, macaron buttons and eclair mode
  buttons on a gingham bakery counter.
- **Crystals** (`src/engine/crystalsSkin.ts`): faceted gemstones in a dark
  cave, cabochon buttons, and a geode tray whose sockets fill with light as
  the next gem forms (the Pigment-style fill wells).
- **Halloween** (`src/engine/halloweenSkin.ts`): glossy candies that drip
  slime, jack-o'-lantern buttons, bats and a moon over foggy hills, and a
  cauldron tray.
- **Winter** (`src/engine/winterSkin.ts`): snow-capped ice cubes, snowball
  buttons, falling snow over hills and pines, and an ice-shelf tray.
- **Christmas** (`src/engine/christmasSkin.ts`): wrapped presents with bows,
  bauble buttons, a string of twinkling lights, a candy-cane wordmark and a
  sleigh tray.
- **Gooey** (`src/engine/gooeySkin.ts`): wobbly jelly tiles with wet
  highlights and drips, slime-blob buttons, bubbles rising through a dark lab
  and a beaker tray.
- **Vintage** (`src/engine/vintageSkin.ts`): letterpress tiles printed out of
  register on aged, halftoned paper, badge buttons, a serif wordmark and a
  wooden type case.
- **Nature** (`src/engine/natureSkin.ts`): river stones with sprouts on a
  wooden board, wood-slice buttons, sun, clouds and blowing leaves over a
  meadow, and a log trough.
- **Stained Glass** (`src/engine/stainedGlassSkin.ts`): bevelled panes set
  in lead came on a stone wall, a rose window that glows when the pointer
  comes near and after a clear, a light shaft drifting across the scene,
  gold boss buttons and a came-channel tray. Settled neighbours of one
  colour lose the lead between them so a growing group reads as one pane;
  pops shatter into glass shards and throw a coloured patch of light onto
  the stone. Display text is Cinzel.
- **Lantern** (`src/engine/lanternSkin.ts`): ribbed paper lanterns lit from
  inside with a halo, strings of lanterns swaying across a night sky that
  dip toward the pointer, fireflies over dark hills, glowing gold buttons
  and a string tray. Pops burst like fireworks and the popped lantern floats
  up and away; a level clear sends embers up out of every column. Display
  text is M PLUS Rounded 1c.
- **Origami** (`src/engine/origamiSkin.ts`): folded paper squares with a
  crease and a lifted corner on a ruled kraft desk, sticky-note buttons,
  layered paper-cut hills and a crane that flaps after a clear. Colour
  mixing folds the new colour over the old along the crease, and pops tear
  into paper scraps that tumble and bounce. Display text is Nunito.
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
The modern themes add the colour theory itself to the picture: a combine
draws a short arc of the colour wheel round the brick from the old colour to
the new, with the primary that joined (or left) sliding along it; while a
brick is selected, the bricks a drop would pop together breathe as one and
are joined by a faint line; pop shockwaves take the popped colour's glyph
(octagon, diamond, circle, nested for mixes); and the biggest pops open on a
single flat-ink impact frame.

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
    arcade.ts    arcade mode catalogue (names, rules)
    well.ts      tall well of cells for Dr. Hue / Hue Trist (lines, groups, gravity)
    drhue.ts     Dr. Hue rules: domino moves, kicks, settling and mixing, scoring
    trist.ts     Hue Trist rules: landing, levels, scoring
    swap.ts      Hue Swap rules: mix-or-swap moves, refill, clock, scoring
    bobble.ts    hex-packed bubble grid plus shot physics, aim and scoring for Hue Bobble
    stains.ts    seeded Dr. Hue stain layouts
  engine/      browser plumbing
    assets.ts    sprite/audio manifest and loader
    audio.ts     Web Audio SFX + looping music
    input.ts     pointer/keyboard with per-frame edge detection
    draw.ts      sprite, text (tabular numerals), card and button helpers
    theme.ts     palettes, including card / button colours per theme
    easing.ts    easing vocabulary
    tween.ts     real-time tween manager
    particles.ts pooled particle system (colour over life, velocity stretch, sparks)
    fragments.ts chunks of a popped tile that keep its own art
    effects.ts   shared effects layer: pop choreography, rings, shake, flash, vignette, bloom
    fxProfile.ts which treatments each theme turns on (Classic: none)
    fxTuning.ts  intensity from chain and size, plus the live numbers the lab edits
    mixFx.ts     the soft "swirl" colour mix with a highlight sweep
    colorUtil.ts parse / mix / shade colours, memoised colour ramps
    synth.ts     procedural sound cues (whoosh, crunch, thump, tick, sparkle) from Web Audio
    clock.ts     frame clock with hit-stop, slow motion and sim interpolation
    buttonFeel.ts press / hover scale for buttons
    soundControls.ts speaker toggle + music / effects sliders shared by settings and the pause card
    themePicker.ts   theme swatches: strip, grid and drawing
    keycaps.ts       keyboard hint row
    modeGlyph.ts     the brick glyph each game mode borrows
    modernSkin.ts  generated "Pigment" sprite set and shared drawing helpers
    blockySkin.ts  generated "Blocky" sprite set
    spectraSkin.ts generated "Spectra" sprite set
    deliciousSkin.ts generated "Delicious" sprite set
    crystalsSkin.ts generated "Crystals" sprite set
    skinKit.ts      shared builder the seasonal themes are made from
    stainedGlassSkin.ts, lanternSkin.ts, origamiSkin.ts  the three newest themes, on the same kit
    halloweenSkin.ts, winterSkin.ts, christmasSkin.ts,
    gooeySkin.ts, vintageSkin.ts, natureSkin.ts
    backdrops.ts    backdrop and tray/well registry by theme
    modernSlides.ts tutorial slides, drawn in whichever theme's style
    tiles.ts     one themed brick anywhere on screen (square, bubble or blob)
    save.ts      localStorage persistence
  scenes/
    TitleScene.ts  logo / Play / Continue -> mode -> world menus, arcade grid, theme picker, settings, credits
    ui.test.ts     title pills, theme picker, pause card and reduce-motion regressions
    GameScene.ts   gameplay state machine, replenish line, tutorial, pause
    FxLabScene.ts  effects lab behind `?fx`: fire each effect on demand, edit tuning live
    arcade/
      ArcadeScene.ts   shared well layout, HUD, cards, controls and effects
      HueBobbleScene.ts, DrHueScene.ts, HueTristScene.ts, HueSwapScene.ts
      arcade.test.ts   state-machine and input regressions, driven through the harness
  test/
    harness.ts   a GameContext for tests: scripted input, hand-advanced clock, silent audio
  main.ts      canvas scaling and the fixed 30 Hz loop
```

## Code conventions

- **Rules live in `core/` as pure functions.** They take the current state (a
  `Well`, a `BubbleGrid`, a piece) and return a result; they never mutate their
  inputs, play a sound or read the clock. The scene applies the result and owns
  the animation. Dr. Hue's `settleDomino` is the model: landing and the ghost
  preview call the same function, so they cannot disagree.
- **Scenes are thin shells** over those functions plus the shared feel layer
  (`easing`, `tween`, `particles`, `clock`). New behaviour goes in a rule
  function with a test first, then a scene hook that calls it.
- **Behaviour is tested through the public surface.** Core modules get plain
  unit tests. Scene behaviour (state machines, input handling) is tested with
  `src/test/harness.ts`, which drives `update()` with scripted input and a
  clock you advance by hand; `internals()` reaches private state when an
  assertion needs it.
- **Effects go through `engine/effects.ts`.** A scene asks for a pop, a mix
  splash, a ring or a shake and the layer decides what that looks like from
  the theme's `fx` profile and the intensity of the moment. Classic's profile
  turns every new treatment off, so the faithful port is unaffected. Each
  theme also names a pop signature (stain, flare, ripple, bouncing chunks or
  the tile floating away), a mix treatment (radial wipe, swirl or paper fold)
  and switches for the mix arc, group preview, glyph-shaped rings and impact
  frame, and the layer plays its own synthesised cues under mixes, fragments and
  hit-stops. A frame-time governor drops bloom, sparks and fragment detail on
  devices that cannot keep up. Tune numbers in the lab (`?fx` on the URL),
  which shows frame and render times, then write them into `fxTuning.ts`.
- `npm run check` is what CI runs; keep it green.

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
