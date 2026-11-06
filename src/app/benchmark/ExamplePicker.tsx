"use client";

import { useState } from "react";
import type { PageExample, PageModel } from "./data";
import { MarginAxis, marginPosition } from "./MarginAxis";

export function ExamplePicker({
  examples,
  models,
}: {
  examples: PageExample[];
  models: PageModel[];
}) {
  const [id, setId] = useState(examples[0].id);
  const example = examples.find((e) => e.id === id) ?? examples[0];
  const names = new Map(models.map((m) => [m.key, m.name]));
  const rows = [...example.scores].sort((a, b) => b.margin - a.margin);
  const semantic = rows.filter((row) => row.key !== "bag-of-words");
  const correct = semantic.filter((row) => row.passed).length;
  return (
    <div className="picker">
      <fieldset className="toggle">
        <legend className="sr-only">Choose an example</legend>
        {examples.map((e) => (
          <button
            type="button"
            key={e.id}
            aria-pressed={e.id === id}
            onClick={() => setId(e.id)}
          >
            {e.anchor}
          </button>
        ))}
      </fieldset>
      <dl className="trio">
        <div>
          <dt>Same meaning</dt>
          <dd>{example.paraphrase}</dd>
        </div>
        <div>
          <dt>Changed meaning</dt>
          <dd>{example.edit}</dd>
        </div>
      </dl>
      <p className="picker-count">
        {correct} of {semantic.length} embedding models got this one right.
      </p>
      <MarginAxis />
      <ul className="dots">
        {rows.map((row) => {
          const name = names.get(row.key) ?? row.key;
          const verdict = row.passed ? "right" : "fooled";
          return (
            <li key={row.key}>
              <span className="dots-name">{name}</span>
              <span className="dots-track">
                <span
                  className={row.passed ? "dot dot-right" : "dot dot-fooled"}
                  style={{ left: `${marginPosition(row.margin)}%` }}
                  title={`${name}: ${verdict}, margin ${row.margin.toFixed(3)}`}
                />
              </span>
              <span className="sr-only">{verdict}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
