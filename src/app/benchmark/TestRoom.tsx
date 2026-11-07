"use client";

import { useState } from "react";
import type { Category } from "@/util/benchmark/types";
import type { PageExample, PageModel } from "./data";
import type { EvidenceRequest } from "./Evidence";
import { SKILLS } from "./labels";

/** Which option comes first, by example, so the answer isn't always in one place. */
const SAME_MEANING_FIRST = [true, false, false, true, false, true];

export function TestRoom({
  examples,
  models,
  onEvidence,
  onDone,
}: {
  examples: PageExample[];
  models: PageModel[];
  onEvidence(request: EvidenceRequest): void;
  onDone(): void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const finished = step === examples.length;
  const score = answers.filter(Boolean).length;
  const byKey = new Map(models.map((model) => [model.key, model]));

  const correctCount = (example: PageExample): number =>
    example.scores.filter((s) => s.key !== "bag-of-words" && s.passed).length;
  const modelTotal = models.length - 1;

  if (finished) {
    const average =
      examples.reduce((sum, example) => sum + correctCount(example), 0) / modelTotal;
    return (
      <section className="room test-done">
        <p className="test-score">
          You got {score} of {examples.length}.
        </p>
        <p>
          The average model got {average.toFixed(1)}. These feel easy because we read
          for meaning. A model only measures how close two texts sit.
        </p>
        <div className="actions">
          <button type="button" className="primary" onClick={onDone}>
            See what models notice
          </button>
          <button
            type="button"
            onClick={() => {
              setStep(0);
              setAnswers([]);
            }}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  const example = examples[step];
  const answered = answers.length > step;
  const sameFirst = SAME_MEANING_FIRST[step % SAME_MEANING_FIRST.length];
  const options = sameFirst
    ? [{ text: example.paraphrase, correct: true }, { text: example.edit, correct: false }]
    : [{ text: example.edit, correct: false }, { text: example.paraphrase, correct: true }];
  const rows = example.scores.filter((s) => s.key !== "bag-of-words");
  const piles = [
    { title: "Correct", rows: rows.filter((s) => s.passed) },
    { title: "Wrong", rows: rows.filter((s) => !s.passed) },
  ];

  const pile = (category: Category, title: string, pileRows: typeof rows) => (
    <div className="pile" key={title}>
      <h3>
        {title} <span>{pileRows.length}</span>
      </h3>
      <ul className="chips">
        {pileRows.map((s) => {
          const model = byKey.get(s.key);
          return (
            model && (
              <li key={s.key}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => onEvidence({ model, category, context: 0 })}
                >
                  {model.name}
                </button>
              </li>
            )
          );
        })}
      </ul>
    </div>
  );

  return (
    <section className="room">
      <ol className="progress" aria-label={`Sentence ${step + 1} of ${examples.length}`}>
        {examples.map((e, i) => (
          <li key={e.id} className={i === step ? "current" : i < step ? "seen" : ""} />
        ))}
      </ol>
      <p className="test-ask">Which one means the same as</p>
      <p className="test-sentence">{example.anchor}</p>
      <div className="options">
        {options.map((option) => {
          const state = !answered ? "" : option.correct ? " option-correct" : " option-wrong";
          return (
            <button
              type="button"
              key={option.text}
              className={`option${state}`}
              disabled={answered}
              onClick={() => setAnswers([...answers, option.correct])}
            >
              {option.text}
              {answered && (
                <span className="option-tag">
                  {option.correct ? "Same meaning" : "Different meaning"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className="reveal">
          <p className="reveal-line">
            {correctCount(example)} of {modelTotal} models were correct. This one tests{" "}
            {SKILLS[example.category].name.toLowerCase()}.
          </p>
          <div className="piles">
            {piles.map(({ title, rows: pileRows }) => pile(example.category, title, pileRows))}
          </div>
          <button type="button" className="primary" onClick={() => setStep(step + 1)}>
            {step + 1 === examples.length ? "See your score" : "Next sentence"}
          </button>
        </div>
      )}
    </section>
  );
}
