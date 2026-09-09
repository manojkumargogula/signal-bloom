import type { KeystrokeEvent, KeystrokeKind } from "./types";

export interface RecordOptions {
  /** Raw timestamp in the `performance.now()` timebase. */
  t: number;
  /** `KeyboardEvent.code`, or null when the character had no physical key. */
  code?: string | null;
  synthetic?: boolean;
}

/**
 * Records every keystroke of a run.
 *
 * The recorder owns the cursor, so it is the single place that knows which
 * character was expected at the moment a key was pressed. Nothing downstream
 * has to re-derive that, which is what keeps the metrics honest.
 *
 * It allocates one small object per keystroke and does nothing else — no
 * aggregation, no analysis, no persistence. All of that happens after the run,
 * because synchronous work in a keystroke handler shows up directly as input
 * latency, and input latency in a typing game is the product.
 */
export class KeystrokeRecorder {
  private readonly events: KeystrokeEvent[] = [];
  private readonly visited = new Set<string>();
  private seq = 0;

  private word = 0;
  private char = 0;

  /** Paused time so far, subtracted from every timestamp. */
  pausedMs = 0;

  constructor(
    private readonly targets: readonly string[],
    private t0: number,
  ) {}

  get log(): readonly KeystrokeEvent[] {
    return this.events;
  }

  get wordIndex(): number {
    return this.word;
  }

  get charIndex(): number {
    return this.char;
  }

  get startedAt(): number {
    return this.t0;
  }

  /** Rebases the clock, for a run that starts on the first keystroke. */
  start(t: number): void {
    this.t0 = t;
  }

  private currentTarget(): string {
    return this.targets[this.word] ?? "";
  }

  private push(
    kind: KeystrokeKind,
    expected: string | null,
    actual: string,
    wordIndex: number,
    charIndex: number,
    correct: boolean,
    options: RecordOptions,
  ): KeystrokeEvent {
    const key = `${wordIndex}:${charIndex}`;
    const firstPress = kind === "insert" && !this.visited.has(key);
    if (kind === "insert") this.visited.add(key);

    const event: KeystrokeEvent = {
      seq: this.seq++,
      t: options.t,
      tActive: Math.max(0, options.t - this.t0 - this.pausedMs),
      kind,
      expected,
      actual,
      code: options.code ?? null,
      correct,
      firstPress,
      wordIndex,
      charIndex,
      synthetic: options.synthetic ?? false,
    };
    this.events.push(event);
    return event;
  }

  /**
   * Records a produced character and advances the cursor.
   *
   * A space closes the current target whenever the target's own final
   * character is a space, which is how the separator stays a normally scored
   * character instead of a special case threaded through every formula.
   */
  insert(actual: string, options: RecordOptions): KeystrokeEvent {
    const target = this.currentTarget();
    const expected = this.char < target.length ? target[this.char] : null;
    const correct = expected !== null && actual === expected;

    const event = this.push(
      "insert",
      expected,
      actual,
      this.word,
      this.char,
      correct,
      options,
    );

    const closesWord = actual === " " && target.endsWith(" ");
    if (closesWord) {
      this.word++;
      this.char = 0;
    } else {
      this.char++;
    }
    return event;
  }

  /**
   * Records a deletion. Deleting never repairs accuracy — the first press at a
   * position is what counts, permanently — but it does let the player fix the
   * text, which improves net speed. Those are two different questions and the
   * results screen answers both.
   */
  backspace(options: RecordOptions): KeystrokeEvent | null {
    if (this.char === 0) return null;
    this.char--;
    return this.push("backspace", null, "", this.word, this.char, false, options);
  }

  /** Clears the current target back to its start. */
  deleteWord(options: RecordOptions): KeystrokeEvent {
    const at = this.char;
    this.char = 0;
    return this.push("deleteWord", null, "", this.word, at, false, options);
  }

  /**
   * Records against an explicit target, for Onslaught — where the player picks
   * which transmission to type, so the cursor is not a single sequential
   * position through one body of text.
   */
  insertAt(
    wordIndex: number,
    charIndex: number,
    expected: string | null,
    actual: string,
    options: RecordOptions,
  ): KeystrokeEvent {
    return this.push(
      "insert",
      expected,
      actual,
      wordIndex,
      charIndex,
      expected !== null && actual === expected,
      options,
    );
  }
}
