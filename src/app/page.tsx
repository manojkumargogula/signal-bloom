import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { gameGraph } from "@/lib/schema";
import { abs } from "@/lib/paths";

export const metadata: Metadata = {
  alternates: { canonical: abs("/") },
};

export default function Page() {
  return (
    <>
      <JsonLd data={gameGraph()} />
      <AppShell />
    </>
  );
}
