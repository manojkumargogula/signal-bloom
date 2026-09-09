/**
 * What the game intercepts, and what it must never touch.
 *
 * The governing rule: a game that swallows Ctrl+T, Cmd+W or Cmd+L is broken
 * software, no matter how good it is. Any keystroke carrying a command
 * modifier is left entirely alone.
 */

export interface KeyIntent {
  kind:
    | "char"
    | "backspace"
    | "deleteWord"
    | "pause"
    | "restart"
    | "confirm"
    | "ignore"
    | "passthrough";
  char?: string;
  preventDefault: boolean;
}

export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  /** True when the operating system is auto-repeating a held key. */
  repeat?: boolean;
}

export function classifyKey(event: KeyLike, isFullscreen: boolean): KeyIntent {
  /*
   * A held key auto-repeats at roughly 30ms, and nothing was filtering it.
   * Every one of those repeats was being recorded as a genuine keystroke,
   * which inflates raw WPM, poisons the interkey latency figures and lets a
   * player hold a key down to fake a score. Holding a key is not typing.
   *
   * Backspace is the exception: holding it to delete is a real editing
   * gesture people expect to work.
   */
  if (event.repeat && event.key !== "Backspace") {
    return { kind: "ignore", preventDefault: true };
  }

  // Ctrl+Backspace and Cmd+Backspace are the one modifier combination worth
  // claiming: they are text editing, not a browser command.
  if ((event.ctrlKey || event.metaKey) && event.key === "Backspace") {
    return { kind: "deleteWord", preventDefault: true };
  }

  // Everything else with a command modifier belongs to the browser or the OS.
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return { kind: "passthrough", preventDefault: false };
  }

  // An IME is mid-composition; the committed text arrives via beforeinput.
  if (event.isComposing || event.key === "Dead" || event.key === "Process") {
    return { kind: "ignore", preventDefault: false };
  }

  switch (event.key) {
    case "Escape":
      // While fullscreen, the browser consumes Escape to exit and we never
      // see it. Pause lives on P as well, which is why the shortcut sheet
      // lists both.
      return { kind: isFullscreen ? "ignore" : "pause", preventDefault: false };
    case "Backspace":
      // Historically this navigated back; still worth preventing.
      return { kind: "backspace", preventDefault: true };
    case "Tab":
      // Never intercepted. Typing sites commonly bind Tab to restart, which
      // traps keyboard-only and screen-reader users inside the game.
      return { kind: "passthrough", preventDefault: false };
    case "Enter":
      return { kind: "confirm", preventDefault: false };
    case " ":
      // A real typed character, and also the page-scroll key, so it has to be
      // claimed while the game has focus.
      return { kind: "char", char: " ", preventDefault: true };
    default:
      break;
  }

  // A single printable character. Anything longer is a named key we do not
  // handle (ArrowLeft, F5, PageDown...), which passes through untouched.
  if ([...event.key].length === 1) {
    return { kind: "char", char: event.key, preventDefault: true };
  }

  return { kind: "passthrough", preventDefault: false };
}

export const PAUSE_KEYS = new Set(["Escape", "p", "P"]);
