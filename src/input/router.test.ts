import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachInputRouter, type InputHandlers } from "./router";
import { resetTimestampCalibration } from "./timestamp";

function setup(opts: { fullscreen?: boolean; accepting?: boolean } = {}) {
  resetTimestampCalibration();
  document.body.innerHTML =
    '<div id="surface"><button id="btn">x</button></div><input id="host" /><input id="other" />';
  const input = document.getElementById("host") as HTMLInputElement;
  const surface = document.getElementById("surface") as HTMLElement;

  const handlers: InputHandlers = {
    onChar: vi.fn(),
    onBackspace: vi.fn(),
    onPause: vi.fn(),
    onConfirm: vi.fn(),
    onPaste: vi.fn(),
  };

  let clock = 1000;
  const detach = attachInputRouter({
    input,
    surface,
    handlers,
    isFullscreen: () => opts.fullscreen ?? false,
    isAccepting: () => opts.accepting ?? true,
    now: () => clock,
  });

  input.focus();

  return {
    input,
    surface,
    handlers,
    detach,
    tick: (ms: number) => (clock += ms),
    // Event timestamps are authoritative in the router -- they are the moment
    // the key was physically pressed, which is the whole point of preferring
    // them over a clock read inside the handler. So tests that care about
    // timing have to set them explicitly rather than moving a fallback clock.
    keydown: (init: Partial<KeyboardEventInit> & { key: string }, ts?: number) => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      if (ts !== undefined) Object.defineProperty(event, "timeStamp", { value: ts });
      window.dispatchEvent(event);
      return event;
    },
    beforeinput: (inputType: string, data: string | null, ts?: number) => {
      // happy-dom does not construct InputEvent with inputType reliably, so
      // the event is built and augmented directly.
      const event = new Event("beforeinput", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "inputType", { value: inputType });
      Object.defineProperty(event, "data", { value: data });
      if (ts !== undefined) Object.defineProperty(event, "timeStamp", { value: ts });
      input.dispatchEvent(event);
      return event;
    },
    composition: (type: "compositionstart" | "compositionend", data = "") => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "data", { value: data });
      input.dispatchEvent(event);
      return event;
    },
  };
}

describe("input router", () => {
  beforeEach(() => resetTimestampCalibration());

  it("pairs a keydown's physical code with the character that follows", () => {
    // The whole reason for two channels: the character is only trustworthy
    // from beforeinput, and the physical key is only available from keydown.
    const s = setup();
    s.keydown({ key: "a", code: "KeyA" });
    s.beforeinput("insertText", "a");

    expect(s.handlers.onChar).toHaveBeenCalledTimes(1);
    const [char, , code, synthetic] = (s.handlers.onChar as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(char).toBe("a");
    expect(code).toBe("KeyA");
    expect(synthetic).toBe(false);
    s.detach();
  });

  it("marks a character with no matching keydown as synthetic", () => {
    // Autocorrect and IME commits arrive without a physical key. They count
    // toward speed and accuracy, but we cannot say which key was pressed, so
    // they must not pollute the heatmap.
    const s = setup();
    s.beforeinput("insertText", "x");

    const [char, , code, synthetic] = (s.handlers.onChar as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(char).toBe("x");
    expect(code).toBeNull();
    expect(synthetic).toBe(true);
    s.detach();
  });

  it("does not pair a stale keydown with a much later character", () => {
    // A code parked half a second ago belongs to a different keystroke.
    // Pairing it anyway would attribute one key's timing to another.
    const s = setup();
    s.keydown({ key: "a", code: "KeyA" }, 1000);
    s.beforeinput("insertText", "a", 1500);

    const [, , code, synthetic] = (s.handlers.onChar as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(code).toBeNull();
    expect(synthetic).toBe(true);
    s.detach();
  });

  it("pairs a code that arrives within the window", () => {
    const s = setup();
    s.keydown({ key: "a", code: "KeyA" }, 1000);
    s.beforeinput("insertText", "a", 1020);
    expect((s.handlers.onChar as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBe("KeyA");
    s.detach();
  });

  it("handles a dead-key sequence as one composed character", () => {
    // The acute accent produces no character of its own; the composed "é"
    // arrives afterwards as a single insertText.
    const s = setup();
    s.keydown({ key: "Dead", code: "Quote" });
    expect(s.handlers.onChar).not.toHaveBeenCalled();

    s.keydown({ key: "e", code: "KeyE" });
    s.beforeinput("insertText", "é");

    expect(s.handlers.onChar).toHaveBeenCalledTimes(1);
    expect((s.handlers.onChar as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("é");
    s.detach();
  });

  it("emits nothing during composition and commits once at the end", () => {
    const s = setup();
    s.composition("compositionstart");
    s.beforeinput("insertCompositionText", "に");
    expect(s.handlers.onChar).not.toHaveBeenCalled();

    s.composition("compositionend", "日本");
    expect(s.handlers.onChar).toHaveBeenCalledTimes(2);
    s.detach();
  });

  it("scores each character of a multi-character commit", () => {
    const s = setup();
    s.beforeinput("insertText", "the");
    expect(s.handlers.onChar).toHaveBeenCalledTimes(3);
    s.detach();
  });

  it("rejects a paste and reports it", () => {
    // A pasted run is not a typing result; the run is flagged rather than
    // silently accepted.
    const s = setup();
    const event = s.beforeinput("insertFromPaste", "cheating");
    expect(event.defaultPrevented).toBe(true);
    expect(s.handlers.onPaste).toHaveBeenCalled();
    expect(s.handlers.onChar).not.toHaveBeenCalled();
    s.detach();
  });

  it("never prevents a browser shortcut", () => {
    const s = setup();
    for (const init of [
      { key: "r", ctrlKey: true },
      { key: "t", ctrlKey: true },
      { key: "w", metaKey: true },
      { key: "l", metaKey: true },
    ]) {
      const event = s.keydown(init);
      expect(event.defaultPrevented, `${init.key}`).toBe(false);
    }
    expect(s.handlers.onChar).not.toHaveBeenCalled();
    s.detach();
  });

  it("does not cancel the space keydown while the input has focus", () => {
    // Regression: preventDefault on a keydown cancels the browser's text
    // insertion, so beforeinput never fires. Guarding space against page
    // scroll this way silently swallowed every space in the run -- the most
    // common character there is.
    const s = setup();
    const event = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    s.input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    // And the space still arrives as a character.
    s.beforeinput("insertText", " ");
    expect((s.handlers.onChar as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(" ");
    s.detach();
  });

  it("blocks page scroll on space when focus has escaped, and still types it", () => {
    // With focus elsewhere there is no beforeinput to lose, so cancelling the
    // keydown is safe -- and the recovery path types the space itself rather
    // than dropping the most common character in the language.
    const s = setup();
    (document.getElementById("other") as HTMLInputElement).focus();

    const event = s.keydown({ key: " ", code: "Space" });
    expect(event.defaultPrevented).toBe(true);
    expect((s.handlers.onChar as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(" ");
    s.detach();
  });

  it("never prevents Tab", () => {
    const s = setup();
    const event = s.keydown({ key: "Tab", code: "Tab" });
    expect(event.defaultPrevented).toBe(false);
    s.detach();
  });

  it("handles backspace and word deletion", () => {
    const s = setup();
    const back = s.keydown({ key: "Backspace" });
    expect(back.defaultPrevented).toBe(true);
    expect(s.handlers.onBackspace).toHaveBeenCalledWith(expect.any(Number), false);

    s.keydown({ key: "Backspace", ctrlKey: true });
    expect(s.handlers.onBackspace).toHaveBeenLastCalledWith(expect.any(Number), true);
    s.detach();
  });

  it("pauses on Escape, and leaves Escape alone in fullscreen", () => {
    const s = setup();
    s.keydown({ key: "Escape" });
    expect(s.handlers.onPause).toHaveBeenCalledTimes(1);
    s.detach();

    const fs = setup({ fullscreen: true });
    fs.keydown({ key: "Escape" });
    expect(fs.handlers.onPause).not.toHaveBeenCalled();
    fs.detach();
  });

  it("blocks input while not accepting, without detaching", () => {
    const s = setup({ accepting: false });
    const event = s.beforeinput("insertText", "a");
    expect(event.defaultPrevented).toBe(true);
    expect(s.handlers.onChar).not.toHaveBeenCalled();
    // Escape still works, so a paused player can resume.
    s.keydown({ key: "Escape" });
    expect(s.handlers.onPause).toHaveBeenCalled();
    s.detach();
  });

  it("removes every listener on detach", () => {
    const s = setup();
    s.detach();
    s.keydown({ key: "a", code: "KeyA" });
    s.beforeinput("insertText", "a");
    expect(s.handlers.onChar).not.toHaveBeenCalled();
    s.keydown({ key: "Escape" });
    expect(s.handlers.onPause).not.toHaveBeenCalled();
  });
});

describe("focus recovery", () => {
  beforeEach(() => resetTimestampCalibration());

  it("types the first keystroke even when focus has escaped", () => {
    // The failure this exists for: the text channel only fires while the
    // hidden input holds focus, so a browser notification bar or a click on
    // the address bar silently killed typing with no symptom beyond nothing
    // happening. Focusing once on mount is not enough.
    const s = setup();
    (document.getElementById("other") as HTMLInputElement).focus();
    expect(document.activeElement).not.toBe(s.input);

    s.keydown({ key: "a", code: "KeyA" });

    // The keystroke is not dropped...
    expect(s.handlers.onChar).toHaveBeenCalledTimes(1);
    const [char, , code, synthetic] = (s.handlers.onChar as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(char).toBe("a");
    expect(code).toBe("KeyA");
    expect(synthetic).toBe(false);
    // ...and focus is back, so the next one goes through the normal channel.
    expect(document.activeElement).toBe(s.input);
    s.detach();
  });

  it("does not count a recovered keystroke twice", () => {
    // Browsers disagree about whether a keydown that moves focus still
    // delivers its text to the newly focused element.
    const s = setup();
    (document.getElementById("other") as HTMLInputElement).focus();

    s.keydown({ key: "b", code: "KeyB" }, 1000);
    s.beforeinput("insertText", "b", 1010);

    expect(s.handlers.onChar).toHaveBeenCalledTimes(1);
    s.detach();
  });

  it("still records a genuine repeat of the same character", () => {
    // "bb" is a real thing to type, so the duplicate guard has to be narrow.
    const s = setup();
    (document.getElementById("other") as HTMLInputElement).focus();

    s.keydown({ key: "b", code: "KeyB" }, 1000);
    s.beforeinput("insertText", "b", 1200); // well past the pairing window

    expect(s.handlers.onChar).toHaveBeenCalledTimes(2);
    s.detach();
  });

  it("restores focus on a click in the play area", () => {
    // On pointerup rather than pointerdown: the browser moves focus during
    // mousedown's default action, which runs after a pointerdown listener, so
    // refocusing there is immediately undone.
    const s = setup();
    (document.getElementById("other") as HTMLInputElement).focus();

    s.surface.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(document.activeElement).toBe(s.input);
    s.detach();
  });

  it("leaves a real control its own focus", () => {
    // A button needs focus to be operable; the keydown path takes it back on
    // the next keystroke anyway.
    const s = setup();
    const button = document.getElementById("btn") as HTMLButtonElement;
    button.focus();

    button.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(document.activeElement).toBe(button);
    s.detach();
  });

  it("restores focus when the window regains it", () => {
    const s = setup();
    (document.getElementById("other") as HTMLInputElement).focus();

    window.dispatchEvent(new Event("focus"));
    expect(document.activeElement).toBe(s.input);
    s.detach();
  });

  it("does not type while paused, even unfocused", () => {
    const s = setup({ accepting: false });
    (document.getElementById("other") as HTMLInputElement).focus();

    s.keydown({ key: "a", code: "KeyA" });
    expect(s.handlers.onChar).not.toHaveBeenCalled();
    // But focus still comes back, so resuming works.
    expect(document.activeElement).toBe(s.input);
    s.detach();
  });
});
