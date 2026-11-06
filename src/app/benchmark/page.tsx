import type { Metadata } from "next";
import Link from "next/link";
import { BenchmarkExplorer } from "./BenchmarkExplorer";
import type { PageSummary } from "./data";
import { ExamplePicker } from "./ExamplePicker";
import { MeaningMap } from "./MeaningMap";
import summary from "./summary.json";

export const metadata: Metadata = {
  title: "Do embedding models understand meaning? | Meaning Maker",
  description:
    "A test of whether embedding models can tell a rewording from a small edit that changes the meaning.",
};

export default function BenchmarkPage() {
  const data = summary as PageSummary;
  const floor = data.models[data.models.length - 1];
  return (
    <main className="page">
      <header className="masthead">
        <p className="masthead-name">
          <Link href="/">Meaning Maker</Link>
        </p>
        <nav aria-label="About">
          <a href="https://github.com/alecf/meaning-maker">Source</a>
        </nav>
      </header>
      <h1 className="bench-title">Do embedding models really understand meaning?</h1>
      <p className="bench-intro">
        An embedding model turns text into a position on a kind of map, so that
        sentences with similar meanings land near each other. So what happens when
        a sentence and its opposite share almost every word?
      </p>

      <MeaningMap />

      <p>
        We gave {data.models.length - 1} embedding models the same test,{" "}
        {data.tripletCount} times over. Each time they saw a sentence, a rewording
        of it, and a small edit that changes what it means. A model gets it right
        if the rewording lands closer. Word counts alone get about{" "}
        {Math.round(floor.overall.rate * 100)}% right, so anything above that is
        the model doing more than matching words.
      </p>

      <h2>Try one</h2>
      <p>
        Pick a sentence to see which models got it right. These six are hand-picked
        to show the range, from an easy win to one that fooled everything.
      </p>
      <ExamplePicker examples={data.examples} models={data.models} />

      <BenchmarkExplorer summary={data} />

      <section className="bench-notes">
        <h2>Before you read too much into this</h2>
        <ul>
          <li>
            This test rewards meaning over shared wording: every rewording swaps
            the words, and every edit keeps them. A low score doesn&apos;t make a
            model bad at search, where shared words often help.
          </li>
          <li>
            Models a few points apart may not really differ, and each kind of
            change rests on only about 20 sets. Sets were reviewed by hand and
            chosen without seeing any model&apos;s scores.
          </li>
          <li>
            Filler sentences are the same in all three texts, so they pull every
            pair closer together. Scores usually fall as text gets longer, though
            Cohere and nomic rise, and we can&apos;t yet explain why.
          </li>
          <li>
            Voyage sometimes returns a different vector for an identical request.
            On a retest, 8 of its 476 verdicts flipped, all with filler.
          </li>
          <li>
            Task settings follow each vendor&apos;s documentation where it covers
            this use. Nomic&apos;s and Cohere&apos;s are the closest documented match,
            so their scores may depend on that choice.
          </li>
          <li>
            Hosted models were reached through OpenRouter, and their vectors
            haven&apos;t been compared with the vendors&apos; own APIs.
          </li>
        </ul>
      </section>
    </main>
  );
}
