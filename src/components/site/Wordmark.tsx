/**
 * The mark: a caret at the centre of an outgoing echo — a signal blooming from
 * a cursor. Hand-authored SVG rather than a generated raster, because it has
 * to stay crisp at 16px, use exact palette values, and recolour per theme.
 * A diffusion model gives you none of the three.
 */
export function Mark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Two echo fronts, decaying outward. */}
      <path d="M4.5 6.5a9 9 0 0 0 0 11" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <path d="M19.5 6.5a9 9 0 0 1 0 11" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <path d="M8 8.5a5.5 5.5 0 0 0 0 7" stroke="currentColor" strokeWidth="1.5" opacity="0.62" />
      <path d="M16 8.5a5.5 5.5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.5" opacity="0.62" />
      {/* The caret. */}
      <rect x="11" y="4" width="2" height="16" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <Mark size={18} className="text-[var(--amber)]" />
      <span className="text-[0.8rem] font-semibold uppercase tracking-[0.2em] text-[var(--fg)]">
        Signal Bloom
      </span>
    </span>
  );
}
