import { describe, expect, it } from "vitest";
import { classifyKey, type KeyLike } from "./policy";
import { normaliseTimestamp, resetTimestampCalibration } from "./timestamp";

const key = (over: Partial<KeyLike>): KeyLike => ({
  key: "a",
  code: "KeyA",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  ...over,
});

describe("classifyKey", () => {
  it("treats a printable character as typed input", () => {
    expect(classifyKey(key({ key: "a", code: "KeyA" }), false)).toMatchObject({
      kind: "char",
      char: "a",
      preventDefault: true,
    });
  });

  it("claims space, which would otherwise scroll the page", () => {
    const intent = classifyKey(key({ key: " ", code: "Space" }), false);
    expect(intent.kind).toBe("char");
    expect(intent.char).toBe(" ");
    expect(intent.preventDefault).toBe(true);
  });

  it("never intercepts a browser or OS shortcut", () => {
    // The rule that keeps the game from being broken software: Cmd+W,
    // Ctrl+T, Cmd+L and friends must always reach the browser.
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) {
      for (const k of ["t", "w", "l", "r", "n", "1"]) {
        const intent = classifyKey(key({ key: k, [mod]: true }), false);
        expect(intent.kind).toBe("passthrough");
        expect(intent.preventDefault).toBe(false);
      }
    }
  });

  it("claims Ctrl+Backspace as word deletion", () => {
    // The one modifier combination worth taking: it is text editing rather
    // than a browser command.
    expect(classifyKey(key({ key: "Backspace", ctrlKey: true }), false).kind)
      .toBe("deleteWord");
    expect(classifyKey(key({ key: "Backspace", metaKey: true }), false).kind)
      .toBe("deleteWord");
  });

  it("leaves Tab alone", () => {
    // Binding Tab to restart traps keyboard-only and screen-reader users
    // inside the play area, which is why the convention is refused here.
    const intent = classifyKey(key({ key: "Tab", code: "Tab" }), false);
    expect(intent.kind).toBe("passthrough");
    expect(intent.preventDefault).toBe(false);
  });

  it("pauses on Escape, but not while fullscreen", () => {
    // Fullscreen browsers consume Escape to exit, so the handler never sees
    // it and pretending otherwise would strand the player.
    expect(classifyKey(key({ key: "Escape" }), false).kind).toBe("pause");
    expect(classifyKey(key({ key: "Escape" }), true).kind).toBe("ignore");
  });

  it("ignores a dead key and waits for the composed character", () => {
    expect(classifyKey(key({ key: "Dead" }), false).kind).toBe("ignore");
  });

  it("ignores keystrokes while an IME is composing", () => {
    expect(classifyKey(key({ key: "a", isComposing: true }), false).kind).toBe("ignore");
  });

  it("passes named keys it does not handle straight through", () => {
    for (const k of ["ArrowLeft", "F5", "PageDown", "Home", "Insert"]) {
      expect(classifyKey(key({ key: k }), false).kind).toBe("passthrough");
    }
  });

  it("handles a multi-code-point character without splitting it", () => {
    // "é" as a single code point is one character; an emoji is two UTF-16
    // units and must not be mistaken for a named key.
    expect(classifyKey(key({ key: "é" }), false).kind).toBe("char");
  });
});

describe("normaliseTimestamp", () => {
  it("passes through a timestamp already on the performance clock", () => {
    resetTimestampCalibration();
    expect(normaliseTimestamp(1234.5, 1240)).toBeCloseTo(1234.5, 5);
  });

  it("shifts an epoch-based timestamp into the performance clock", () => {
    // Some environments report Date.now() here. Left uncorrected, every
    // latency figure would be computed from a 55-year offset.
    resetTimestampCalibration();
    const epoch = 1_760_000_000_000;
    const now = 5000;
    expect(normaliseTimestamp(epoch, now)).toBeCloseTo(now, 5);
  });

  it("falls back to the handler clock for a missing timestamp", () => {
    resetTimestampCalibration();
    expect(normaliseTimestamp(0, 999)).toBe(999);
  });

  it("keeps the same offset for every later event", () => {
    resetTimestampCalibration();
    const epoch = 1_760_000_000_000;
    normaliseTimestamp(epoch, 1000);
    // A second event 250ms later must land 250ms later on our clock too.
    expect(normaliseTimestamp(epoch + 250, 1300)).toBeCloseTo(1250, 5);
  });
});
