import type { Finger } from "./types";

/**
 * Keyboard layout profiles.
 *
 * `KeyboardEvent.code` is physically fixed — `KeyA` is the same key on every
 * layout — but which finger *should* press it depends on the layout the player
 * has chosen. So the finger map belongs to the profile, not to a constant, and
 * adding Dvorak or Colemak is a new file rather than a change to the metrics.
 */

export interface KeyDef {
  code: string;
  /** What is printed on the physical key, for the heatmap. */
  label: string;
  /** Fraction of a standard key width; 1 unless the key is wide. */
  width?: number;
}

export interface LayoutProfile {
  id: string;
  name: string;
  /** Rows of the rendered keyboard, in visual order. */
  rows: KeyDef[][];
  fingerMap: Record<string, Finger>;
  homeRow: string[];
}

const ROWS: KeyDef[][] = [
  [
    { code: "Backquote", label: "`" },
    { code: "Digit1", label: "1" },
    { code: "Digit2", label: "2" },
    { code: "Digit3", label: "3" },
    { code: "Digit4", label: "4" },
    { code: "Digit5", label: "5" },
    { code: "Digit6", label: "6" },
    { code: "Digit7", label: "7" },
    { code: "Digit8", label: "8" },
    { code: "Digit9", label: "9" },
    { code: "Digit0", label: "0" },
    { code: "Minus", label: "-" },
    { code: "Equal", label: "=" },
    { code: "Backspace", label: "⌫", width: 2 },
  ],
  [
    { code: "Tab", label: "tab", width: 1.5 },
    { code: "KeyQ", label: "Q" },
    { code: "KeyW", label: "W" },
    { code: "KeyE", label: "E" },
    { code: "KeyR", label: "R" },
    { code: "KeyT", label: "T" },
    { code: "KeyY", label: "Y" },
    { code: "KeyU", label: "U" },
    { code: "KeyI", label: "I" },
    { code: "KeyO", label: "O" },
    { code: "KeyP", label: "P" },
    { code: "BracketLeft", label: "[" },
    { code: "BracketRight", label: "]" },
    { code: "Backslash", label: "\\", width: 1.5 },
  ],
  [
    { code: "CapsLock", label: "caps", width: 1.75 },
    { code: "KeyA", label: "A" },
    { code: "KeyS", label: "S" },
    { code: "KeyD", label: "D" },
    { code: "KeyF", label: "F" },
    { code: "KeyG", label: "G" },
    { code: "KeyH", label: "H" },
    { code: "KeyJ", label: "J" },
    { code: "KeyK", label: "K" },
    { code: "KeyL", label: "L" },
    { code: "Semicolon", label: ";" },
    { code: "Quote", label: "'" },
    { code: "Enter", label: "enter", width: 2.25 },
  ],
  [
    { code: "ShiftLeft", label: "shift", width: 2.25 },
    { code: "KeyZ", label: "Z" },
    { code: "KeyX", label: "X" },
    { code: "KeyC", label: "C" },
    { code: "KeyV", label: "V" },
    { code: "KeyB", label: "B" },
    { code: "KeyN", label: "N" },
    { code: "KeyM", label: "M" },
    { code: "Comma", label: "," },
    { code: "Period", label: "." },
    { code: "Slash", label: "/" },
    { code: "ShiftRight", label: "shift", width: 2.75 },
  ],
  [{ code: "Space", label: "space", width: 10 }],
];

/** Standard touch-typing assignment for a QWERTY row-stagger board. */
const QWERTY_FINGERS: Record<string, Finger> = {
  Backquote: "LP", Digit1: "LP", KeyQ: "LP", KeyA: "LP", KeyZ: "LP",
  Tab: "LP", CapsLock: "LP", ShiftLeft: "LP",

  Digit2: "LR", KeyW: "LR", KeyS: "LR", KeyX: "LR",
  Digit3: "LM", KeyE: "LM", KeyD: "LM", KeyC: "LM",

  Digit4: "LI", Digit5: "LI", KeyR: "LI", KeyT: "LI",
  KeyF: "LI", KeyG: "LI", KeyV: "LI", KeyB: "LI",

  Space: "RT",

  Digit6: "RI", Digit7: "RI", KeyY: "RI", KeyU: "RI",
  KeyH: "RI", KeyJ: "RI", KeyN: "RI", KeyM: "RI",

  Digit8: "RM", KeyI: "RM", KeyK: "RM", Comma: "RM",
  Digit9: "RR", KeyO: "RR", KeyL: "RR", Period: "RR",

  Digit0: "RP", Minus: "RP", Equal: "RP", KeyP: "RP",
  BracketLeft: "RP", BracketRight: "RP", Backslash: "RP",
  Semicolon: "RP", Quote: "RP", Slash: "RP",
  Enter: "RP", Backspace: "RP", ShiftRight: "RP",
};

export const QWERTY: LayoutProfile = {
  id: "qwerty",
  name: "QWERTY",
  rows: ROWS,
  fingerMap: QWERTY_FINGERS,
  homeRow: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"],
};

export const LAYOUTS: Record<string, LayoutProfile> = { qwerty: QWERTY };

export function getLayout(id: string): LayoutProfile {
  return LAYOUTS[id] ?? QWERTY;
}

export const FINGER_ORDER: Finger[] = ["LP", "LR", "LM", "LI", "LT", "RT", "RI", "RM", "RR", "RP"];

export const FINGER_LABEL: Record<Finger, string> = {
  LP: "Left pinky",
  LR: "Left ring",
  LM: "Left middle",
  LI: "Left index",
  LT: "Left thumb",
  RT: "Right thumb",
  RI: "Right index",
  RM: "Right middle",
  RR: "Right ring",
  RP: "Right pinky",
};

/**
 * Physically adjacent keys, used to tag a substitution as a neighbour slip.
 * That tag is what turns "you made 6 errors" into "you keep hitting E
 * instead of R", which is the only version a player can act on.
 */
const ADJACENCY: Record<string, string[]> = {};
for (const row of ROWS) {
  for (let i = 0; i < row.length; i++) {
    const near: string[] = [];
    if (i > 0) near.push(row[i - 1].code);
    if (i < row.length - 1) near.push(row[i + 1].code);
    ADJACENCY[row[i].code] = near;
  }
}
// Vertical neighbours for the three letter rows, offset by the row stagger.
const LETTER_ROWS = [ROWS[1], ROWS[2], ROWS[3]];
for (let r = 0; r < LETTER_ROWS.length - 1; r++) {
  const upper = LETTER_ROWS[r];
  const lower = LETTER_ROWS[r + 1];
  for (let i = 1; i < upper.length - 1; i++) {
    for (const j of [i - 1, i]) {
      const below = lower[j];
      if (!below) continue;
      ADJACENCY[upper[i].code]?.push(below.code);
      ADJACENCY[below.code]?.push(upper[i].code);
    }
  }
}

export function areAdjacent(codeA: string | null, codeB: string | null): boolean {
  if (!codeA || !codeB) return false;
  return ADJACENCY[codeA]?.includes(codeB) ?? false;
}

/** Reverse lookup: which physical key produces this character on QWERTY. */
const CHAR_TO_CODE: Record<string, string> = {};
{
  const unshifted = "`1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./ ";
  const shifted = '~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:"ZXCVBNM<>? ';
  const codes = [
    "Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6",
    "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal",
    "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO",
    "KeyP", "BracketLeft", "BracketRight", "Backslash",
    "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL",
    "Semicolon", "Quote",
    "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM",
    "Comma", "Period", "Slash", "Space",
  ];
  codes.forEach((code, i) => {
    CHAR_TO_CODE[unshifted[i]] = code;
    CHAR_TO_CODE[shifted[i]] = code;
  });
}

export function codeForChar(ch: string): string | null {
  return CHAR_TO_CODE[ch] ?? null;
}
