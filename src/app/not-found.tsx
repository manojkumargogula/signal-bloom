import Link from "next/link";
import { Wordmark } from "@/components/site/Wordmark";

export default function NotFound() {
  return (
    <div data-scroll="true" className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--line)] px-4 py-2.5">
        <Link href="/">
          <Wordmark />
        </Link>
      </header>
      <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-5 py-28">
        <p className="label text-[var(--amber)]">No return</p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--fg)]">
          Nothing on this frequency
        </h1>
        <p className="text-[var(--fg-muted)]">
          That page does not exist. It may have moved, or the link may be wrong.
        </p>
        <Link
          href="/"
          className="mt-2 bg-[var(--amber)] px-5 py-2.5 font-semibold text-[var(--bg)] transition-[filter] hover:brightness-110"
        >
          Back to the game
        </Link>
      </main>
    </div>
  );
}
