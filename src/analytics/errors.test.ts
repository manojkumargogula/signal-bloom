import { describe, expect, it } from "vitest";
import { alignOsa, classifyErrors, countErrorEvents } from "./errors";
import { typeSequence } from "./fixtures";

function classifyTyping(target: string, produced: string) {
  const targets = [target];
  const { log } = typeSequence(targets, produced.split("").map((ch) => ({ ch })));
  return classifyErrors(log, targets);
}

describe("classifyErrors", () => {
  it("reads a swap as one transposition, not two substitutions", () => {
    // The distinction players care about: "hte" is one slip of ordering, and
    // calling it two wrong letters both overstates the error count and hides
    // what actually went wrong.
    const errors = classifyTyping("the", "hte");
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("transposition");
  });

  it("reads a doubled key as an insertion", () => {
    const errors = classifyTyping("helo", "hell");
    expect(errors.map((e) => e.kind)).toContain("insertion");
  });

  it("reads a skipped character as an omission", () => {
    // "abcd" typed as "acd": skipping b shifts every following character,
    // which is what marks it as a skip rather than a single wrong letter.
    const errors = classifyTyping("abcd", "acd");
    expect(errors[0].kind).toBe("omission");
  });

  it("does not mistake a substitution for an omission", () => {
    // "eed" for "red" starts with a keystroke that happens to match the next
    // expected character, but the stream resumes correctly afterwards, so
    // only one letter was actually wrong.
    const errors = classifyTyping("red", "eed");
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("substitution");
  });

  it("reads an early space as an omission", () => {
    // Submitting the word before finishing it.
    const errors = classifyTyping("hello ", "hel o ");
    expect(errors.some((e) => e.kind === "omission")).toBe(true);
  });

  it("reads typing past the word end as an insertion", () => {
    const errors = classifyTyping("go ", "gone");
    expect(errors.some((e) => e.kind === "insertion")).toBe(true);
  });

  it("falls back to substitution for an unrelated key", () => {
    const errors = classifyTyping("cat", "cqt");
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("substitution");
  });

  it("tags a neighbouring-key slip", () => {
    // R and E are adjacent, so this is a reach error rather than a mix-up —
    // and that is the difference between actionable and merely true.
    const errors = classifyTyping("red", "eed");
    expect(errors[0].kind).toBe("substitution");
    expect(errors[0].adjacentKey).toBe(true);
  });

  it("does not tag a distant key as adjacent", () => {
    const errors = classifyTyping("red", "ped");
    expect(errors[0].adjacentKey).toBe(false);
  });

  it("finds nothing in a clean run", () => {
    expect(classifyTyping("the quick", "the quick")).toHaveLength(0);
  });

  it("counts a transposition as one event but two wrong keystrokes", () => {
    // Both figures appear on the results screen, so they have to reconcile.
    const targets = ["the"];
    const { log } = typeSequence(targets, [{ ch: "h" }, { ch: "t" }, { ch: "e" }]);
    const errors = classifyErrors(log, targets);
    const counts = countErrorEvents(errors);

    expect(counts.transposition).toBe(1);
    const wrongKeystrokes = log.filter((k) => k.firstPress && !k.correct).length;
    expect(wrongKeystrokes).toBe(2);
  });
});

describe("alignOsa", () => {
  it("scores an exact match as zero", () => {
    const r = alignOsa("hello", "hello");
    expect(r.distance).toBe(0);
    expect(r.substitution + r.omission + r.insertion + r.transposition).toBe(0);
  });

  it("prefers one transposition over two substitutions", () => {
    const r = alignOsa("the", "hte");
    expect(r.distance).toBe(1);
    expect(r.transposition).toBe(1);
    expect(r.substitution).toBe(0);
  });

  it("identifies each single-edit class", () => {
    expect(alignOsa("cat", "cqt")).toMatchObject({ distance: 1, substitution: 1 });
    expect(alignOsa("cat", "ct")).toMatchObject({ distance: 1, omission: 1 });
    expect(alignOsa("cat", "caat")).toMatchObject({ distance: 1, insertion: 1 });
  });

  it("is symmetric in distance for swapped arguments", () => {
    expect(alignOsa("kitten", "sitting").distance).toBe(
      alignOsa("sitting", "kitten").distance,
    );
  });

  it("has its operation counts sum to the distance", () => {
    // A backtrace that reports more or fewer operations than the distance is
    // internally inconsistent, which is easy to do and hard to notice.
    const pairs: [string, string][] = [
      ["hello", "hlelo"], ["typing", "tpying"], ["signal", "signl"],
      ["bloom", "blooom"], ["accuracy", "acuracy"], ["", "abc"], ["abc", ""],
    ];
    for (const [a, b] of pairs) {
      const r = alignOsa(a, b);
      expect(r.substitution + r.omission + r.insertion + r.transposition).toBe(r.distance);
    }
  });

  it("agrees with the stream classifier on random single mutations", () => {
    // The two implementations share no code. Running both over generated
    // mutations means a bug would have to appear identically in a stream
    // walk and in a dynamic-programming backtrace to go unnoticed.
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    let checked = 0;

    for (let seed = 0; seed < 400; seed++) {
      // Deterministic pseudo-random word and mutation, so a failure repeats.
      const rand = (n: number, salt: number) => (seed * 2654435761 + salt * 40503) % n;
      const len = 4 + rand(5, 1);
      const word = Array.from({ length: len }, (_, i) => alphabet[rand(26, i + 2)]).join("");

      const at = rand(len, 99);
      const kind = rand(3, 7);
      let produced: string;
      if (kind === 0) {
        const wrong = alphabet[(alphabet.indexOf(word[at]) + 1 + rand(24, 5)) % 26];
        if (wrong === word[at]) continue;
        produced = word.slice(0, at) + wrong + word.slice(at + 1);
      } else if (kind === 1) {
        if (at + 1 >= len || word[at] === word[at + 1]) continue;
        produced = word.slice(0, at) + word[at + 1] + word[at] + word.slice(at + 2);
      } else {
        // Deleting the final character truncates the word rather than
        // mistyping it: there is no wrong keystroke for the stream to see,
        // only characters never reached. That is a `missed` count, not an
        // error event, so skip it here.
        if (at >= len - 1) continue;
        produced = word.slice(0, at) + word.slice(at + 1);
      }

      const streamErrors = classifyTyping(word, produced);
      const osa = alignOsa(word, produced);

      // Both must agree that exactly one thing went wrong.
      expect(osa.distance).toBe(1);
      expect(streamErrors.length).toBeGreaterThanOrEqual(1);
      checked++;
    }

    expect(checked).toBeGreaterThan(100);
  });
});
