"use client";
import type { EmbedResponse, SentenceInfo } from "@/types";
import {
  detectFormat,
  extractBlocks,
  parseDocument,
  type TextFormat,
} from "@/util/document";
import type { Root } from "hast";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Reader } from "./Reader";
import { SAMPLE_TEXT } from "./sample";

const MAX_LENGTH = 3000;

async function fetchScores(
  tree: Root,
  windowSize: number,
): Promise<SentenceInfo[][]> {
  const response = await fetch(`/api/embeddoc?window_size=${windowSize}`, {
    method: "POST",
    body: encodeURIComponent(extractBlocks(tree).join("\n")),
  });
  if (!response.ok) {
    throw new Error(
      `The analysis failed with error ${response.status}. Try again.`,
    );
  }
  const { response: paragraphs }: EmbedResponse = await response.json();
  return paragraphs;
}

export function Analyzer() {
  const [input, setInput] = useState("");
  const [windowSize, setWindowSize] = useState(8);
  const [chosenFormat, setChosenFormat] = useState<TextFormat | null>(null);
  const [tree, setTree] = useState<Root | null>(null);
  const [paragraphs, setParagraphs] = useState<SentenceInfo[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);
  const leftReader = useRef(false);

  const format = chosenFormat ?? detectFormat(input);
  const canAnalyze = input.trim() !== "";
  const isDetected = chosenFormat === null && format === "markdown";

  useEffect(() => {
    if (!tree && leftReader.current) {
      leftReader.current = false;
      textareaRef.current?.focus();
    }
  }, [tree]);

  const handleEdit = () => {
    requestId.current++;
    leftReader.current = true;
    setTree(null);
    setParagraphs(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const id = ++requestId.current;
    const parsed = parseDocument(input, format);
    setError(null);
    setTree(parsed);
    try {
      const scores = await fetchScores(parsed, windowSize);
      if (id === requestId.current) {
        setParagraphs(scores);
      }
    } catch (cause) {
      if (id === requestId.current) {
        handleEdit();
        setError(
          cause instanceof Error ? cause.message : "The analysis failed.",
        );
      }
    }
  };

  if (tree) {
    return <Reader tree={tree} paragraphs={paragraphs} onEdit={handleEdit} />;
  }

  return (
    <form className="specimen" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        className="sheet editor"
        aria-label="Text to analyze"
        placeholder="Paste an article, an essay or a Markdown file…"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        maxLength={MAX_LENGTH}
      />
      <div className="specimen-foot">
        <p>
          Need something to try? Use{" "}
          <button
            type="button"
            className="link"
            onClick={() => setInput(SAMPLE_TEXT)}
          >
            a sample
          </button>{" "}
          or part of a{" "}
          <a
            href="https://en.wikipedia.org/wiki/Special:Random"
            target="_blank"
            rel="noreferrer"
          >
            random Wikipedia page
          </a>
          .
        </p>
        <p className="count">
          {input.length.toLocaleString("en-US")} of{" "}
          {MAX_LENGTH.toLocaleString("en-US")} characters
        </p>
      </div>
      <div className="controls">
        <label className="control">
          <span>
            Context: {windowSize} {windowSize === 1 ? "sentence" : "sentences"}
          </span>
          <input
            type="range"
            min={1}
            max={10}
            value={windowSize}
            onChange={(event) => setWindowSize(event.target.valueAsNumber)}
          />
        </label>
        <label className="control check">
          <input
            type="checkbox"
            checked={format === "markdown"}
            onChange={(event) =>
              setChosenFormat(event.target.checked ? "markdown" : "plain")
            }
          />
          <span>
            Format as Markdown{isDetected && " (detected)"}
          </span>
        </label>
        <button
          type="submit"
          className="button primary"
          disabled={!canAnalyze}
        >
          Analyze text
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
