"use client";
import type { SentenceInfo } from "@/types";
import { type ScoredSentence, shadeDocument } from "@/util/document";
import type { Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import {
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";

interface ReaderProps {
  tree: Root;
  /** Scores for the document; null while they're on their way */
  paragraphs: SentenceInfo[][] | null;
  onEdit: () => void;
}

function formatChange(change: number): string {
  return `${change > 0 ? "+" : ""}${change.toFixed(3)}`;
}

function sentenceAt(target: EventTarget): number | null {
  const span = (target as Element).closest("[data-sentence]");
  return span ? Number(span.getAttribute("data-sentence")) : null;
}

function describeSentence(
  { similarity, change }: ScoredSentence,
  index: number,
  total: number,
): ReactNode {
  if (index === 0) {
    return "First sentence: nothing to compare it with yet.";
  }
  return (
    <>
      Sentence {index + 1} of {total}: <b>{similarity.toFixed(3)}</b> similar to
      the text before it
      {change !== null && ` (${formatChange(change)})`}.
    </>
  );
}

export function Reader({ tree, paragraphs, onEdit }: ReaderProps) {
  const [active, setActive] = useState<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);

  const { tree: shaded, sentences } = useMemo(
    () => (paragraphs ? shadeDocument(tree, paragraphs) : { tree, sentences: [] }),
    [tree, paragraphs],
  );
  const content = useMemo(
    () => toJsxRuntime(shaded, { Fragment, jsx, jsxs }),
    [shaded],
  );

  // The button that opened this view is gone, so bring focus along. On a phone
  // it was below the fold, which would otherwise leave you mid-document.
  useEffect(() => {
    const sheet = sheetRef.current;
    sheet?.focus({ preventScroll: true });
    if (sheet && sheet.getBoundingClientRect().top < 0) {
      sheet.scrollIntoView();
    }
  }, []);

  const handleHover = (event: PointerEvent) => {
    if (event.pointerType === "mouse") {
      setActive(sentenceAt(event.target));
    }
  };
  // Clicks as well as focus: iOS Safari may not focus a tapped span
  const handleSelect = (event: FocusEvent | MouseEvent) => {
    setActive(sentenceAt(event.target));
  };

  let readout: ReactNode;
  if (!paragraphs) {
    readout = <span className="pending">Comparing each sentence…</span>;
  } else if (active !== null) {
    readout = describeSentence(sentences[active], active, sentences.length);
  } else if (sentences.length === 0) {
    readout = "None of these sentences are long enough to score. Add more text.";
  } else {
    readout = "Select a sentence to see its score. Code and very short lines aren't scored.";
  }

  return (
    <section className="specimen" aria-label="Analysis">
      <div className="specimen-head">
        <div className="legend">
          <span>Repeated</span>
          <span className="legend-bar" aria-hidden="true" />
          <span>New</span>
        </div>
        <button type="button" className="button" onClick={onEdit}>
          Edit text
        </button>
      </div>
      {active !== null && (
        <style>{`.sent[data-sentence="${active}"]{opacity:1;background:var(--highlight)}`}</style>
      )}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users select through onFocus */}
      <article
        ref={sheetRef}
        className="sheet prose"
        tabIndex={-1}
        aria-busy={!paragraphs}
        onPointerOver={handleHover}
        onPointerLeave={() => setActive(null)}
        onFocus={handleSelect}
        onClick={handleSelect}
        onBlur={() => setActive(null)}
      >
        {content}
      </article>
      <p className="readout" aria-live="polite">
        {readout}
      </p>
    </section>
  );
}
