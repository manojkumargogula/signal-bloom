/**
 * Calibrates `event.timeStamp` against `performance.now()`.
 *
 * Modern browsers give `event.timeStamp` a high-resolution value sharing
 * `performance.now()`'s time origin, which is exactly what we want: it is the
 * moment the key was actually pressed, not the moment our handler happened to
 * run. Reading `performance.now()` inside the handler instead would measure
 * event-dispatch delay and fold it into every latency figure.
 *
 * But some environments still hand back epoch milliseconds, and synthetic
 * events (and a few extensions) report 0. So the first real event calibrates
 * an offset, and everything afterwards goes through it.
 */

let offset: number | null = null;

/** Only for tests: forgets the calibration. */
export function resetTimestampCalibration(): void {
  offset = null;
}

export function normaliseTimestamp(eventTimeStamp: number, now: number): number {
  if (!Number.isFinite(eventTimeStamp) || eventTimeStamp <= 0) {
    // No usable timestamp; fall back to the handler's own clock.
    return now;
  }

  if (offset === null) {
    // A gap this large means the two are on different time origins, so the
    // event clock is epoch-based and needs shifting into ours.
    offset = Math.abs(eventTimeStamp - now) > 5000 ? now - eventTimeStamp : 0;
  }

  return eventTimeStamp + offset;
}
