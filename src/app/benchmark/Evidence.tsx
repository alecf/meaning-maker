"use client";

import { useEffect, useRef, useState } from "react";
import type { Category } from "@/util/benchmark/types";
import type { DetailTriplet, PageDetails, PageModel } from "./data";
import { SKILLS } from "./labels";
import { pickStrength } from "./verdict";

const DETAILS_URL = "/benchmark/details.json";

export interface EvidenceRequest {
  model: PageModel;
  /** Leave out for every kind of change. */
  category?: Category;
  context: number;
}

interface Row extends DetailTriplet {
  margin: number;
  passed: boolean;
}

let loaded: Promise<PageDetails> | undefined;

function loadDetails(): Promise<PageDetails> {
  loaded ??= fetch(DETAILS_URL).then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<PageDetails>;
  });
  loaded.catch(() => {
    loaded = undefined;
  });
  return loaded;
}

function rowsFor(details: PageDetails, { model, category, context }: EvidenceRequest): Row[] {
  const { margins, passed } = details.scores[model.key][context];
  return details.triplets
    .map((triplet, i) => ({ ...triplet, margin: margins[i], passed: passed[i] === "1" }))
    .filter((row) => !category || row.category === category);
}

function Choice({ label, text, picked }: { label: string; text: string; picked: boolean }) {
  return (
    <div className={picked ? "choice choice-picked" : "choice"}>
      <span className="choice-label">
        {label}
        {picked && <strong> · The model&apos;s pick</strong>}
      </span>
      <p>{text}</p>
    </div>
  );
}

export function Evidence({
  request,
  onClose,
}: {
  request: EvidenceRequest;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<PageDetails>();
  const [failed, setFailed] = useState(false);
  const [showWrong, setShowWrong] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.addEventListener("close", onClose);
    loadDetails()
      .then(setDetails)
      .catch(() => setFailed(true));
    return () => element?.removeEventListener("close", onClose);
  }, [onClose]);

  const { model, category, context } = request;
  const rows = details ? rowsFor(details, request) : [];
  const wrong = rows.filter((row) => !row.passed).sort((a, b) => a.margin - b.margin);
  const correct = rows.filter((row) => row.passed).sort((a, b) => b.margin - a.margin);
  const wrongShown = showWrong && wrong.length > 0;
  const shown = wrongShown ? wrong : correct;
  const row = shown[Math.min(index, shown.length - 1)];
  const choose = (next: boolean): void => {
    setShowWrong(next);
    setIndex(0);
  };

  return (
    <dialog ref={dialog} className="evidence">
      <div className="evidence-head">
        <div>
          <h2>{model.name}</h2>
          <p>
            {category ? SKILLS[category].name : "Every kind of change"}
            {context > 0 && `, with ${context} unrelated ${context === 1 ? "sentence" : "sentences"} in front`}
          </p>
        </div>
        <button type="button" className="evidence-close" onClick={onClose}>
          Close
        </button>
      </div>
      {failed && <p role="alert">The examples couldn&apos;t load. Reload the page to try again.</p>}
      {!details && !failed && <p>Loading the examples…</p>}
      {row && (
        <>
          <div className="segmented">
            <button type="button" aria-pressed={wrongShown} disabled={wrong.length === 0} onClick={() => choose(true)}>
              Wrong ({wrong.length})
            </button>
            <button type="button" aria-pressed={!wrongShown} disabled={correct.length === 0} onClick={() => choose(false)}>
              Correct ({correct.length})
            </button>
          </div>
          <p className="evidence-original">{row.anchor}</p>
          <p className="evidence-ask">Which sentence did the model think means the same?</p>
          <Choice label="Same meaning" text={row.paraphrase} picked={row.passed} />
          <Choice label="Different meaning" text={row.edit} picked={!row.passed} />
          <p className="evidence-verdict">
            <strong>{row.passed ? "Correct." : "Wrong."}</strong> {pickStrength(row.margin)}
          </p>
          <div className="pager">
            <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              Previous
            </button>
            <span>
              {Math.min(index, shown.length - 1) + 1} of {shown.length}
            </span>
            <button type="button" disabled={index >= shown.length - 1} onClick={() => setIndex(index + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
