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
  now?: () => number;
}

const PAIR_WINDOW_MS = 50;

export function attachInputRouter(options: RouterOptions): () => void {
  const { input, handlers, isFullscreen, isAccepting } = options;
  const now = options.now ?? (() => performance.now());

  let pendingCode: string | null = null;
  let pendingAt = 0;
  let composing = false;

  const takeCode = (t: number): string | null => {
    if (pendingCode === null) return null;
    const fresh = t - pendingAt <= PAIR_WINDOW_MS || pendingAt === 0;
    const code = fresh ? pendingCode : null;
    pendingCode = null;
    return code;
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

        // Do NOT preventDefault here while the capture input has focus.
        // Cancelling a keydown cancels the browser's text insertion, so
        // beforeinput never fires and the character is silently lost. That is
        // exactly what happened to every space: the scroll guard swallowed
        // the most common character in the language.
        //
        // A focused text input already absorbs space without scrolling the
        // page, so the guard is only needed when focus has escaped -- and in
        // that case there is no beforeinput to lose.
        if (intent.preventDefault && event.target !== input) {
          event.preventDefault();
        }
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

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keydown", onPauseKey);
  input.addEventListener("beforeinput", onBeforeInput);
  input.addEventListener("input", onInput);
  input.addEventListener("compositionstart", onCompositionStart);
  input.addEventListener("compositionend", onCompositionEnd);
  input.addEventListener("paste", onPaste);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keydown", onPauseKey);
    input.removeEventListener("beforeinput", onBeforeInput);
    input.removeEventListener("input", onInput);
    input.removeEventListener("compositionstart", onCompositionStart);
    input.removeEventListener("compositionend", onCompositionEnd);
    input.removeEventListener("paste", onPaste);
  };
}
