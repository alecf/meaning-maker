import { Analyzer } from "./Analyzer";

export default function Home() {
  return (
    <main className="page">
      <header className="masthead">
        <h1>Meaning Maker</h1>
        <nav aria-label="About">
          <a href="https://alecf.com/meaning-maker/">How it works</a>
          <a href="https://github.com/alecf/meaning-maker">Source</a>
        </nav>
      </header>
      <p className="dek">
        Writing repeats itself.{" "}
        <span className="dek-faded">
          Writing says the same things over and over.
        </span>{" "}
        Paste some text to see which sentences add something new.
      </p>
      <Analyzer />
    </main>
  );
}
