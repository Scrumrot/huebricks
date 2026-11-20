import { describe, expect, it } from "vitest";
import {
  barFill,
  lineProgress,
  linePushed,
  lineShortened,
  lineState,
  period,
  pushCountdown,
  rewindLine,
  stepLine,
  tickThroughAnimation,
  wellLevel,
  type LineState,
} from "./replenish";

/** Run rest steps until an event fires or `max` steps pass. */
function runUntilEvent(s: LineState, n: number, max = 10000): { state: LineState; events: string[]; steps: number } {
  let state = s;
  for (let i = 1; i <= max; i++) {
    const r = stepLine(state, n, state.num, 1);
    state = r.state;
    if (r.events.length > 0) return { state, events: r.events, steps: i };
  }
  throw new Error("no event");
}

describe("replenish line", () => {
  it("spawns the first brick quietly, then fills on the period with a sound", () => {
    const first = stepLine(lineState(60), 7, 0, 1);
    expect(first.events).toEqual(["spawn"]);
    expect(first.state.num).toBe(1);
    expect(first.state.line).toBe(1);
    const next = runUntilEvent(first.state, 7);
    expect(next.events).toEqual(["fill"]);
    expect(next.steps).toBe(61);
    expect(next.state.num).toBe(2);
    expect(next.state.line).toBe(1);
  });

  it("arms the push as soon as the line is full and fires after the shorter countdown", () => {
    let s = { ...lineState(100), num: 6 };
    const full = runUntilEvent(s, 7);
    expect(full.events).toEqual(["fill"]);
    expect(full.state.readyToPush).toBe(true);
    expect(full.state.line).toBe(1);
    s = full.state;
    expect(pushCountdown(s)).toBe(60);
    const push = runUntilEvent(s, 7);
    expect(push.events).toEqual(["push"]);
    expect(push.steps).toBe(61);
    expect(push.state).toEqual({ timer: 100, line: 0, num: 0, readyToPush: false });
    expect(linePushed({ ...s, line: 30 })).toEqual(push.state);
  });

  it("the hurry button runs the period down faster", () => {
    let s = { ...lineState(60), num: 1 };
    let steps = 0;
    for (;;) {
      const r = stepLine(s, 7, s.num, 3);
      s = r.state;
      steps++;
      if (r.events.length) break;
    }
    expect(steps).toBeLessThan(25);
  });

  it("keeps ticking through animations but never past the period", () => {
    const s = { ...lineState(10), line: 9, num: 2 };
    expect(tickThroughAnimation(s).line).toBe(10);
    expect(tickThroughAnimation({ ...s, line: 10 }).line).toBe(10);
    const armed = { ...s, readyToPush: true, line: 5 };
    expect(period(armed)).toBe(6);
    expect(tickThroughAnimation(armed).line).toBe(6);
    expect(tickThroughAnimation({ ...armed, line: 6 }).line).toBe(6);
  });

  it("a pop rewinds the fill but not a push countdown", () => {
    expect(rewindLine({ timer: 10, line: 7, num: 2, readyToPush: false }).line).toBe(0);
    expect(rewindLine({ timer: 10, line: 4, num: 7, readyToPush: true }).line).toBe(4);
  });

  it("taking a brick off a full line disarms the push", () => {
    const s = lineShortened({ timer: 10, line: 4, num: 7, readyToPush: true }, 6, 7);
    expect(s.num).toBe(6);
    expect(s.readyToPush).toBe(false);
    expect(lineShortened({ timer: 10, line: 4, num: 7, readyToPush: true }, 7, 7).readyToPush).toBe(true);
  });

  it("progress rises through the fills and the bar drains during the countdown", () => {
    const n = 4;
    let s = { ...lineState(10), num: 1, line: 1 };
    let last = -1;
    for (let i = 0; i < 60; i++) {
      const p = lineProgress(s, n);
      if (s.line !== 0) expect(p).toBeGreaterThanOrEqual(last);
      last = s.line === 0 ? -1 : p;
      const r = stepLine(s, n, s.num, 1);
      s = r.state;
      if (r.events.includes("push")) break;
    }
    const armed = { timer: 10, line: 3, num: 4, readyToPush: true };
    expect(barFill(armed, n)).toBeCloseTo(0.5);
    expect(barFill({ ...armed, line: 6 }, n)).toBe(0);
  });

  it("the next well fills with the period, in eight steps when stepped, and empties once the push is armed", () => {
    expect(wellLevel({ timer: 10, line: 5, num: 2, readyToPush: false })).toBeCloseTo(0.5);
    expect(wellLevel({ timer: 10, line: 5.5, num: 2, readyToPush: false }, true)).toBe(0.5);
    expect(wellLevel({ timer: 10, line: 5, num: 7, readyToPush: true })).toBe(0);
  });
});
