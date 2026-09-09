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
const SCHEMA = 1;

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

export function loadHistory(): HistoryEntry[] {
  const file = read<HistoryFile>(HISTORY_KEY, { schema: SCHEMA, runs: [] });
  if (file.schema !== SCHEMA || !Array.isArray(file.runs)) return [];
  return file.runs;
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

  if (result.metrics.valid) updateBest(result);
}

export interface Best {
  wpm: number;
  accuracy: number;
  at: number;
}

export type Bests = Record<string, Best>;

/** Personal bests are keyed by mode and configuration, never mixed. */
export function bestKey(result: Pick<RunResult, "mode"> & { durationMs?: number }): string {
  return result.durationMs ? `${result.mode}:${result.durationMs}` : result.mode;
}

export function loadBests(): Bests {
  return read<Bests>(BESTS_KEY, {});
}

function updateBest(result: RunResult): void {
  const bests = loadBests();
  const key = bestKey({ mode: result.mode, durationMs: result.metrics.durationMs });
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
  const key = bestKey({ mode: result.mode, durationMs: result.metrics.durationMs });
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
