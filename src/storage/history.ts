import type { RunResult } from "@/engine/GameEngine";

/**
 * Run history, in localStorage.
 *
 * Two rules:
 *
 *   Never write during a run. `setItem` is synchronous main-thread I/O, and
 *   once the history blob grows it becomes a visible hitch — which in a typing
 *   game means a dropped keystroke. Everything is persisted once, at the end.
 *
 *   Every read and write is wrapped. Safari's private mode throws on write,
 *   storage can be full, and the stored JSON can be from an older version or
 *   simply corrupt. None of those may break the game; the worst acceptable
 *   outcome is losing history.
 *
 * Keys are namespaced because localStorage on github.io is shared across every
 * project hosted on that origin.
 */

const PREFIX = "signalbloom:v1";
const HISTORY_KEY = `${PREFIX}:history`;
const BESTS_KEY = `${PREFIX}:bests`;
const SCHEMA = 3;

/** History entries drop the keystroke log: it is large and rarely re-read. */
export type HistoryEntry = Omit<RunResult, "metrics"> & {
  metrics: Pick<
    RunResult["metrics"],
    "wpm" | "rawWpm" | "accuracy" | "consistency" | "durationMs" | "valid"
  >;
};

interface HistoryFile {
  schema: number;
  runs: HistoryEntry[];
}

const MAX_RUNS = 500;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt JSON, or storage unavailable. Defaults are always safe here.
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Modes that no longer exist.
 *
 * Every one of them scored something incomparable with a climb: Onslaught
 * counted waves cleared, Sprint measured a fixed number of seconds, Zen kept
 * no score at all. Putting any of them in one trend line beside a height
 * would be a chart of two different quantities, so they are dropped rather
 * than relabelled.
 */
const RETIRED_MODES = new Set(["onslaught", "sprint", "zen"]);

/**
 * Reads the history, migrating an older file in place.
 *
 * Neither version bump could be a bare bump. `loadHistory` returns nothing on
 * a schema mismatch, so raising the number on its own would silently destroy
 * every run in the file rather than only the retired ones -- which is exactly
 * the history a player cares about. Hence a real migration, and hence it
 * accepts EVERY older version rather than only the one immediately behind:
 * someone who last played before Ascent existed has a schema-1 file, and
 * skipping them would be the same data loss with extra steps.
 */
export function loadHistory(): HistoryEntry[] {
  const file = read<HistoryFile>(HISTORY_KEY, { schema: SCHEMA, runs: [] });
  if (!Array.isArray(file.runs)) return [];

  if (file.schema === SCHEMA) return file.runs;

  if (file.schema >= 1 && file.schema < SCHEMA) {
    const kept = file.runs.filter((run) => !RETIRED_MODES.has(run.mode));
    write(HISTORY_KEY, { schema: SCHEMA, runs: kept });

    // The bests map is keyed by mode, so it needs the same treatment or a
    // retired mode keeps a record nothing can ever match. Schema 2 keyed a
    // timed mode's bests as `sprint:30000`, so the mode is the part before
    // the colon.
    const bests = read<Bests>(BESTS_KEY, {});
    const keptBests = Object.fromEntries(
      Object.entries(bests).filter(([key]) => !RETIRED_MODES.has(key.split(":")[0])),
    );
    if (Object.keys(keptBests).length !== Object.keys(bests).length) {
      write(BESTS_KEY, keptBests);
    }

    bestsCache = null;
    return kept;
  }

  // A version from the future, or something unrecognisable. Better to show an
  // empty history than to guess at a shape.
  return [];
}

export function saveRun(result: RunResult): void {
  const entry: HistoryEntry = {
    ...result,
    metrics: {
      wpm: result.metrics.wpm,
      rawWpm: result.metrics.rawWpm,
      accuracy: result.metrics.accuracy,
      consistency: result.metrics.consistency,
      durationMs: result.metrics.durationMs,
      valid: result.metrics.valid,
    },
  };

  const runs = loadHistory();
  runs.push(entry);
  // Ring the buffer rather than growing without bound: 500 runs is more
  // history than anyone reads, and an unbounded blob eventually hits quota.
  while (runs.length > MAX_RUNS) runs.shift();
  write(HISTORY_KEY, { schema: SCHEMA, runs });
  invalidateHistory();

  if (result.metrics.valid) updateBest(result);
}

export interface Best {
  wpm: number;
  accuracy: number;
  at: number;
}

export type Bests = Record<string, Best>;

/**
 * Personal bests are keyed by mode.
 *
 * By mode ALONE, now that the game is untimed. The key used to carry the run
 * length, so a 15-second test and a 120-second one could not shadow each
 * other -- and with a mode whose runs are whatever length the flood allows,
 * that made every single run its own bucket with nothing to compare against,
 * so a personal best was both always set and never beaten. A climb is
 * comparable with any other climb; length is a result, not a setting.
 */
export function bestKey(result: Pick<RunResult, "mode">): string {
  return result.mode;
}

export function loadBests(): Bests {
  return read<Bests>(BESTS_KEY, {});
}

function updateBest(result: RunResult): void {
  const bests = loadBests();
  const key = bestKey({ mode: result.mode });
  const current = bests[key];
  if (!current || result.metrics.wpm > current.wpm) {
    bests[key] = {
      wpm: result.metrics.wpm,
      accuracy: result.metrics.accuracy,
      at: result.startedAt,
    };
    write(BESTS_KEY, bests);
    invalidateBests();
  }
}

export function isPersonalBest(result: RunResult): boolean {
  if (!result.metrics.valid) return false;
  const bests = loadBests();
  const key = bestKey({ mode: result.mode });
  const best = bests[key];
  // Saving happens before the results screen renders, so the run's own entry
  // is already in place; equality means this run set it.
  return !best || result.metrics.wpm >= best.wpm;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(BESTS_KEY);
  } catch {
    // Nothing to do; the player asked to clear data that cannot be reached.
  }
  invalidateBests();
  invalidateHistory();
}


/**
 * Personal bests as an external store, for React to read.
 *
 * localStorage cannot be touched during render, so the naive approach is to
 * read it in an effect and mirror it into state -- which causes a cascading
 * render on mount and gives the first paint a value that is known to be
 * wrong. Reading it through `useSyncExternalStore` instead means one render
 * with the right answer.
 */
const bestsListeners = new Set<() => void>();

/** Cached so `getSnapshot` returns a stable reference between writes. */
let bestsCache: Bests | null = null;

export function subscribeBests(listener: () => void): () => void {
  bestsListeners.add(listener);
  return () => bestsListeners.delete(listener);
}

export function getBestsSnapshot(): Bests {
  if (bestsCache === null) bestsCache = loadBests();
  return bestsCache;
}

export function getBestsServerSnapshot(): Bests {
  return EMPTY_BESTS;
}

const EMPTY_BESTS: Bests = {};

function invalidateBests(): void {
  bestsCache = null;
  for (const listener of bestsListeners) listener();
}


/**
 * Run history as an external store.
 *
 * Same reasoning as the bests store above: localStorage cannot be read during
 * render, and copying it into state through an effect gives the first paint a
 * value already known to be wrong.
 */
const historyListeners = new Set<() => void>();

let historyCache: HistoryEntry[] | null = null;

const EMPTY_HISTORY: HistoryEntry[] = [];

export function subscribeHistory(listener: () => void): () => void {
  historyListeners.add(listener);
  return () => historyListeners.delete(listener);
}

export function getHistorySnapshot(): HistoryEntry[] {
  if (historyCache === null) historyCache = loadHistory();
  return historyCache;
}

export function getHistoryServerSnapshot(): HistoryEntry[] {
  return EMPTY_HISTORY;
}

function invalidateHistory(): void {
  historyCache = null;
  for (const listener of historyListeners) listener();
}
