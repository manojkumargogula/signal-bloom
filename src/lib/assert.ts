/** Thrown by engine invariants. Never caught in normal operation. */
export class InvariantError extends Error {
  constructor(message: string) {
    super(`invariant: ${message}`);
    this.name = "InvariantError";
  }
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InvariantError(message);
}

/** Development-only invariant. Stripped from production by the bundler. */
export function devInvariant(condition: unknown, message: string): void {
  if (process.env.NODE_ENV !== "production" && !condition) {
    throw new InvariantError(message);
  }
}
