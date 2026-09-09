import Link from "next/link";
import type { ReactNode } from "react";
import { REPO_URL } from "@/lib/paths";
import { Wordmark } from "./Wordmark";

/**
 * The frame for the prose pages.
 *
 * These are the pages search and answer engines actually cite, so they are
 * ordinary scrolling documents with real semantic markup, rendered entirely on
 * the server with no client JavaScript. The game screen carries none of this
 * -- it is a single locked viewport -- which is why they opt out of the
 * document-level scroll lock with `data-scroll`.
 */
export function DocPage({
  eyebrow,
  title,
  lede,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div data-scroll="true" className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--line)] px-4 py-2.5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-5 text-xs text-[var(--fg-muted)]">
            <Link href="/metrics/" className="hover:text-[var(--amber)]">Metrics</Link>
            <Link href="/how-it-works/" className="hover:text-[var(--amber)]">How it works</Link>
            <Link href="/faq/" className="hover:text-[var(--amber)]">FAQ</Link>
            <a href={REPO_URL} className="hover:text-[var(--amber)]">Source</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="label text-[var(--amber)]">{eyebrow}</p>
        <h1 className="mt-3 text-balance text-4xl font-semibold leading-[1.12] tracking-tight text-[var(--fg)]">
          {title}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--fg-muted)]">{lede}</p>
        {updated && (
          <p className="mt-4 text-xs text-[var(--fg-faint)]">Last reviewed {updated}</p>
        )}

        <div className="mt-12 flex flex-col gap-12">{children}</div>

        <p className="mt-16 border-t border-[var(--line)] pt-6 text-sm text-[var(--fg-muted)]">
          <Link href="/" className="text-[var(--amber)] underline-offset-4 hover:underline">
            Back to the game
          </Link>
        </p>
      </main>
    </div>
  );
}

/**
 * A section with a question-shaped heading and a self-contained answer.
 *
 * The `id` matters: it makes every answer deep-linkable, which is how a
 * citation lands on the section rather than on the homepage.
 */
export function Answer({
  id,
  question,
  children,
}: {
  id: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--fg)]">
        <a href={`#${id}`} className="hover:text-[var(--amber)]">{question}</a>
      </h2>
      <div className="mt-3 flex flex-col gap-3 leading-relaxed text-[var(--fg-muted)]">
        {children}
      </div>
    </section>
  );
}

export function Formula({ children }: { children: ReactNode }) {
  return (
    <pre className="type-surface overflow-x-auto border border-[var(--line)] bg-[var(--bg-inset)] px-4 py-3 text-sm text-[var(--fg)]">
      {children}
    </pre>
  );
}
