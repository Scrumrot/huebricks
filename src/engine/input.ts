/**
 * Single-pointer input (mouse or touch) in logical screen coordinates, with
 * per-frame edge detection to mirror GameMaker's
 * `device_mouse_check_button_pressed/released`.
 */
export class Input {
  x = -1;
  y = -1;
  /** Button currently held. */
  down = false;
  /** Became pressed during this frame. */
  pressed = false;
  /** Became released during this frame. */
  released = false;
  /** Keys pressed during this frame (KeyboardEvent.key values). */
  keysPressed = new Set<string>();
  /** Keys currently held. */
  keysDown = new Set<string>();
  /** Minimum hit-test size in logical units (raised on small screens so targets stay >= 44 CSS px). */
  minHit = 0;

  /** Queued events; each entry knows whether it is a button press or release. */
  private queue: Array<{ kind: "move" | "press" | "release" | "key"; apply: () => void }> = [];
  private toLogical: (cx: number, cy: number) => { x: number; y: number };
  private onFirstGesture: (() => void) | null;

  constructor(
    canvas: HTMLCanvasElement,
    toLogical: (cx: number, cy: number) => { x: number; y: number },
    onFirstGesture?: () => void,
  ) {
    this.toLogical = toLogical;
    this.onFirstGesture = onFirstGesture ?? null;

    const move = (e: PointerEvent) => {
      const p = this.toLogical(e.clientX, e.clientY);
      this.queue.push({
        kind: "move",
        apply: () => {
          this.x = p.x;
          this.y = p.y;
        },
      });
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Some synthetic or already-released pointers cannot be captured; the press still counts.
      }
      this.fireGesture();
      const p = this.toLogical(e.clientX, e.clientY);
      this.queue.push({
        kind: "press",
        apply: () => {
          this.x = p.x;
          this.y = p.y;
          this.down = true;
          this.pressed = true;
        },
      });
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", move);
    const up = (e: PointerEvent) => {
      const p = this.toLogical(e.clientX, e.clientY);
      this.queue.push({
        kind: "release",
        apply: () => {
          this.x = p.x;
          this.y = p.y;
          if (this.down) this.released = true;
          this.down = false;
        },
      });
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.fireGesture();
      const key = e.key;
      this.queue.push({
        kind: "key",
        apply: () => {
          this.keysPressed.add(key);
          this.keysDown.add(key);
        },
      });
      if (["ArrowUp", "ArrowDown", " "].includes(key)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      const key = e.key;
      // a letter held across a Shift change reports the other case on keyup; release both
      this.queue.push({
        kind: "key",
        apply: () => {
          this.keysDown.delete(key);
          this.keysDown.delete(key.toLowerCase());
          this.keysDown.delete(key.toUpperCase());
        },
      });
    });
    window.addEventListener("blur", () => {
      this.queue.push({
        kind: "release",
        apply: () => {
          this.keysDown.clear();
          if (this.down) this.released = true;
          this.down = false;
        },
      });
    });
  }

  private fireGesture(): void {
    if (this.onFirstGesture) {
      const fn = this.onFirstGesture;
      this.onFirstGesture = null;
      fn();
    }
  }

  /**
   * Apply queued events at the start of a simulation step.
   *
   * At most one click (press and release) is delivered per step so that two
   * quick clicks never collapse into one frame and lose a press or release.
   */
  beginFrame(): void {
    this.pressed = false;
    this.released = false;
    this.keysPressed.clear();
    let i = 0;
    let seenPress = false;
    for (; i < this.queue.length; i++) {
      const ev = this.queue[i];
      if (ev.kind === "press") {
        if (seenPress) break;
        seenPress = true;
      }
      ev.apply();
      if (ev.kind === "release" && this.released) {
        i++;
        break;
      }
    }
    this.queue.splice(0, i);
  }

  inRect(x: number, y: number, w: number, h: number): boolean {
    return this.x >= x && this.x <= x + w && this.y >= y && this.y <= y + h;
  }

  /** Hit test against a rectangle given by its centre. */
  inCentered(cx: number, cy: number, w: number, h: number): boolean {
    const hw = Math.max(w, this.minHit);
    const hh = Math.max(h, this.minHit);
    return this.inRect(cx - hw / 2, cy - hh / 2, hw, hh);
  }
}
