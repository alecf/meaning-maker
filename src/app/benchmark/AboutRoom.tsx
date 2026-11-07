"use client";

import type { Category } from "@/util/benchmark/types";
import type { PageSummary } from "./data";
import type { EvidenceRequest } from "./Evidence";
import { SKILL_ORDER, SKILLS } from "./labels";
import { MeaningMap } from "./MeaningMap";

export function AboutRoom({
  summary,
  onEvidence,
}: {
  summary: PageSummary;
  onEvidence(request: EvidenceRequest): void;
}) {
  const skills = SKILL_ORDER.filter((c: Category) => summary.categories.includes(c));
  const hasPaws = summary.models.some((model) => model.pawsAuc !== undefined);
  return (
    <section className="room about">
      <h2>How this works</h2>
      <p>
        An embedding model turns text into a position on a map of meaning, then
        measures how close two texts sit. The test gives it a sentence and two
        others. One says the same thing in new words. The other keeps the words and
        changes the meaning. It&apos;s correct if the same-meaning sentence sits closer.
      </p>
      <MeaningMap />
      <h3>Before you read too much into this</h3>
      <ul>
        <li>
          We ran {summary.tripletCount} tests, reviewed by hand and chosen without
          seeing any model&apos;s scores. Each kind of change has only about 20, so
          treat small differences as ties.
        </li>
        <li>
          This rewards meaning over shared wording. A low score doesn&apos;t make a
          model bad at search, where shared words often help.
        </li>
        <li>
          Longer text adds unrelated sentences in front of all three texts, which
          pulls them closer together. Most scores fall, but what a model got right
          alone mostly stays its strength. Cohere and nomic improve, and we can&apos;t
          yet explain why.
        </li>
        <li>
          Voyage sometimes gives a different result for an identical request. On a
          retest, 8 of its 476 answers flipped, all with added sentences.
        </li>
        <li>
          Settings follow each vendor&apos;s documentation where it covers this use.
          Nomic&apos;s and Cohere&apos;s are the closest documented match, so their
          scores may depend on that choice.
        </li>
        <li>
          Paid models were reached through OpenRouter, which resells model APIs.
          Their results haven&apos;t been compared with the vendors&apos; own.
        </li>
        {!hasPaws && (
          <li>
            An outside check on PAWS, a public paraphrase dataset, is still to come.
          </li>
        )}
      </ul>
      <h3>Every score</h3>
      <div className="grid-scroll">
        <table className="grid">
          <caption>Percent correct by model and kind of change, on single sentences</caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">All</th>
              {skills.map((skill) => (
                <th scope="col" key={skill}>
                  {SKILLS[skill].name}
                </th>
              ))}
              {hasPaws && <th scope="col">PAWS</th>}
            </tr>
          </thead>
          <tbody>
            {summary.models.map((model) => (
              <tr key={model.key}>
                <th scope="row">{model.name}</th>
                <td>
                  <button
                    type="button"
                    className="cell"
                    style={{ "--rate": model.overall.rate } as React.CSSProperties}
                    aria-label={`${model.name}, all: ${Math.round(model.overall.rate * 100)}%`}
                    onClick={() => onEvidence({ model, context: 0 })}
                  >
                    {Math.round(model.overall.rate * 100)}
                  </button>
                </td>
                {skills.map((skill) => {
                  const rate = model.categories[skill]?.rate ?? 0;
                  return (
                    <td key={skill}>
                      <button
                        type="button"
                        className="cell"
                        style={{ "--rate": rate } as React.CSSProperties}
                        aria-label={`${model.name}, ${SKILLS[skill].name}: ${Math.round(rate * 100)}%`}
                        onClick={() => onEvidence({ model, category: skill, context: 0 })}
                      >
                        {Math.round(rate * 100)}
                      </button>
                    </td>
                  );
                })}
                {hasPaws && <td>{model.pawsAuc?.toFixed(2) ?? "–"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
