"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "quiet";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[var(--amber)] text-[var(--bg)] font-semibold hover:brightness-110",
  ghost:
    "border border-[var(--line-strong)] text-[var(--fg)] hover:border-[var(--amber)] hover:text-[var(--amber)]",
  quiet: "text-[var(--fg-muted)] hover:text-[var(--fg)]",
};

export function Button({ variant = "ghost", className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={[
        "inline-flex items-center justify-center gap-2 px-3.5 py-1.5 text-sm",
        "transition-[color,border-color,background-color,filter] duration-100",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** A rendered keycap, for shortcut hints. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num border border-[var(--line-strong)] px-1.5 py-px text-[0.68rem] text-[var(--fg-muted)]">
      {children}
    </kbd>
  );
}

/** A segmented control. Everything in the top bar is one of these. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center border border-[var(--line)]"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={[
              "px-3 py-1.5 text-xs font-medium transition-colors duration-100",
              active
                ? "bg-[var(--amber)] text-[var(--bg)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
