import { classifyKey } from "./policy";
import { normaliseTimestamp } from "./timestamp";

/**
 * Keyboard capture.
 *
 * Dual-channel, because neither channel alone is sufficient and choosing one
 * is the most common way a browser typing game ends up broken:
 *
 *   TEXT comes from `beforeinput` on a focused, visually hidden input. That is
 *   the only source that is correct for dead keys (´ then e arrives as one
 *   "é"), for IME commits, for autocorrect, and for Android keyboards, which
 *   fire keydown with key "Unidentified" and keyCode 229.
 *
 *   CONTROL and TELEMETRY come from a window keydown listener. That is the
 *   only source of `event.code`, the physical key, which the heatmap and the
 *   finger breakdown both require because `event.key` depends on the layout.
 *
 * The two are paired through a one-slot register: keydown parks the physical
 * code, and the next insertText consumes it if it arrives within 50ms.
 * A character with no parked code came from somewhere we cannot attribute, so
 * it is marked synthetic — still counted for speed and accuracy, excluded
 * from latency and the heatmap.
 */

export interface InputHandlers {
  onChar(char: string, t: number, code: string | null, synthetic: boolean): void;
  onBackspace(t: number, wordDelete: boolean): void;
  onPause(): void;
  onConfirm(): void;
  onPaste(): void;
}

export interface RouterOptions {
  /** The hidden input that owns text entry. */
  input: HTMLInputElement | HTMLTextAreaElement;
  handlers: InputHandlers;
  isFullscreen: () => boolean;
  /** Blocks input while paused or drafting, without tearing the listeners down. */
  isAccepting: () => boolean;
  /**
   * The play area. A pointerdown anywhere inside it restores focus to the
   * capture input, so a stray click is recoverable by clicking back.
   */
  surface?: HTMLElement | null;
  now?: () => number;
}

const PAIR_WINDOW_MS = 50;

export function attachInputRouter(options: RouterOptions): () => void {
  const { input, handlers, isFullscreen, isAccepting, surface } = options;
  const now = options.now ?? (() => performance.now());

  let pendingCode: string | null = null;
  let pendingAt = 0;
  let composing = false;

  /**
   * A character already handled from keydown because the input had lost
   * focus. If the browser then also delivers it to the newly focused input,
   * this swallows the duplicate.
   */
  let recovered: { char: string; at: number } | null = null;

  const takeCode = (t: number): string | null => {
    if (pendingCode === null) return null;
    const fresh = t - pendingAt <= PAIR_WINDOW_MS || pendingAt === 0;
    const code = fresh ? pendingCode : null;
    pendingCode = null;
    return code;
  };

  const hasFocus = (): boolean => document.activeElement === input;

  const refocus = (): void => {
    if (!hasFocus()) input.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const t = normaliseTimestamp(event.timeStamp, now());
    const intent = classifyKey(event, isFullscreen());

    if (intent.kind === "passthrough") return;

    switch (intent.kind) {
      case "pause":
        event.preventDefault();
        handlers.onPause();
        return;
      case "confirm":
        handlers.onConfirm();
        return;
      case "backspace":
        event.preventDefault();
        if (isAccepting()) handlers.onBackspace(t, false);
        return;
      case "deleteWord":
        event.preventDefault();
        if (isAccepting()) handlers.onBackspace(t, true);
        return;
      case "ignore":
        return;
      case "char":
        // Park the physical key for the beforeinput that follows. The
        // character itself is NOT taken from here: event.key is wrong for
        // dead keys and unavailable on Android.
        pendingCode = event.code || null;
        pendingAt = t;

        // If focus has escaped, no beforeinput is coming, so this keystroke
        // would be dropped and the player would be stuck with a game that
        // does not respond. Handle it here and take focus back, so recovery
        // costs nothing and needs no click.
        if (!hasFocus()) {
          refocus();
          if (isAccepting() && intent.char !== undefined) {
            recovered = { char: intent.char, at: t };
            handlers.onChar(intent.char, t, event.code || null, false);
          }
          // Space would scroll the page, and with focus elsewhere there is no
          // text field absorbing it.
          if (intent.preventDefault) event.preventDefault();
          return;
        }

        // Do NOT preventDefault here while the capture input has focus.
        // Cancelling a keydown cancels the browser's text insertion, so
        // beforeinput never fires and the character is silently lost. That is
        // exactly what happened to every space: the scroll guard swallowed
        // the most common character in the language.
        return;
      default:
        return;
    }
  };

  // P is a second pause key because fullscreen swallows Escape. Handled
  // separately so it is not mistaken for a typed character mid-run.
  const onPauseKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.key === "p" || event.key === "P") && !isAccepting()) {
      event.preventDefault();
      handlers.onPause();
    }
  };

  const onBeforeInput = (event: Event): void => {
    const ie = event as InputEvent;
    const t = normaliseTimestamp(ie.timeStamp, now());

    if (ie.inputType === "insertFromPaste" || ie.inputType === "insertFromDrop") {
      event.preventDefault();
      handlers.onPaste();
      return;
    }

    if (!isAccepting()) {
      event.preventDefault();
      return;
    }

    // Deletions are handled on keydown, where the intent is unambiguous.
    if (ie.inputType.startsWith("delete")) {
      event.preventDefault();
      return;
    }

    if (ie.inputType === "insertText" || ie.inputType === "insertCompositionText") {
      const data = ie.data ?? "";
      event.preventDefault();
      if (composing && ie.inputType === "insertCompositionText") return;

      // Browsers disagree about whether a keydown that moves focus still
      // delivers its text to the newly focused element. If it does, this is
      // the same keystroke the recovery path already handled.
      if (recovered && recovered.char === data && t - recovered.at <= PAIR_WINDOW_MS) {
        recovered = null;
        return;
      }
      recovered = null;

      // A commit can carry more than one character: an IME phrase, or a
      // browser expanding an autocorrect. Each is scored individually.
      const chars = [...data];
      for (let i = 0; i < chars.length; i++) {
        const code = i === 0 ? takeCode(t) : null;
        handlers.onChar(chars[i], t, code, code === null);
      }
      return;
    }

    if (ie.inputType === "insertLineBreak" || ie.inputType === "insertParagraph") {
      event.preventDefault();
    }
  };

  const onCompositionStart = (): void => {
    composing = true;
  };

  const onCompositionEnd = (event: Event): void => {
    composing = false;
    const ce = event as CompositionEvent;
    const t = normaliseTimestamp(ce.timeStamp, now());
    if (!isAccepting()) return;

    for (const ch of [...(ce.data ?? "")]) {
      handlers.onChar(ch, t, null, true);
    }
    input.value = "";
  };

  const onInput = (): void => {
    // The input is only a capture surface; its value is never read. Clearing
    // it keeps it from growing, but never mid-composition, which would break
    // CJK entry.
    if (!composing) input.value = "";
  };

  const onPaste = (event: Event): void => {
    event.preventDefault();
    handlers.onPaste();
  };

  // Clicking anywhere in the play area hands focus back, so the caret is
  // live and a mobile keyboard appears without needing a keystroke first.
  //
  // On pointerUP, not pointerdown: the browser moves focus as part of
  // mousedown's default action, which runs after a pointerdown listener --
  // so refocusing there is immediately undone. This is also why it is not
  // worth preventing the default instead: that would break text selection.
  const onPointerUp = (event: Event): void => {
    // Leave real controls alone. A button needs its own focus to be
    // operable, and the keydown recovery above takes focus back on the next
    // keystroke anyway.
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, [role='dialog']")) return;
    refocus();
  };

  // Returning to the tab or the window should not require a click either.
  const onWindowFocus = (): void => refocus();
  const onVisibility = (): void => {
    if (!document.hidden) refocus();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keydown", onPauseKey);
  window.addEventListener("focus", onWindowFocus);
  document.addEventListener("visibilitychange", onVisibility);
  (surface ?? document).addEventListener("pointerup", onPointerUp);
  input.addEventListener("beforeinput", onBeforeInput);
  input.addEventListener("input", onInput);
  input.addEventListener("compositionstart", onCompositionStart);
  input.addEventListener("compositionend", onCompositionEnd);
  input.addEventListener("paste", onPaste);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keydown", onPauseKey);
    window.removeEventListener("focus", onWindowFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    (surface ?? document).removeEventListener("pointerup", onPointerUp);
    input.removeEventListener("beforeinput", onBeforeInput);
    input.removeEventListener("input", onInput);
    input.removeEventListener("compositionstart", onCompositionStart);
    input.removeEventListener("compositionend", onCompositionEnd);
    input.removeEventListener("paste", onPaste);
  };
}
