import type { Metadata } from "next";
import Link from "next/link";
import type { PageSummary } from "./data";
import { Exhibit } from "./Exhibit";
import summary from "./summary.json";

export const metadata: Metadata = {
  title: "What embedding models understand | Meaning Maker",
  description:
    "Take the test the models took, then see which embedding models notice negation, numbers and more, and which don't.",
};

export default function BenchmarkPage() {
  return (
    <main className="exhibit">
      <header className="exhibit-head">
        <p className="exhibit-home">
          <Link href="/">Meaning Maker</Link>
        </p>
        <h1>What do embedding models actually understand?</h1>
      </header>
      <Exhibit summary={summary as PageSummary} />
    </main>
  );
}
