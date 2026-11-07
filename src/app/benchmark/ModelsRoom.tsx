"use client";

import type { Category } from "@/util/benchmark/types";
import type { PageModel, PageSummary } from "./data";
import type { EvidenceRequest } from "./Evidence";
import { SKILL_ORDER, SKILLS } from "./labels";
import { LengthControl } from "./LengthControl";
import { MODEL_FACTS } from "./modelFacts";
import { VERDICT_NAMES, VERDICT_ORDER, verdictFor } from "./verdict";

function Fingerprint({ model, context }: { model: PageModel; context: number }) {
  return (
    <span className="fingerprint" aria-hidden="true">
      {SKILL_ORDER.map((skill) => (
        <span
          key={skill}
          style={{ "--rate": model.grid[context][skill]?.rate ?? 0 } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

function listNames(names: string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function ModelsRoom({
  summary,
  modelKey,
  context,
  onModel,
  onContext,
  onEvidence,
}: {
  summary: PageSummary;
  modelKey: string;
  context: number;
  onModel(key: string): void;
  onContext(context: number): void;
  onEvidence(request: EvidenceRequest): void;
}) {
  const model = summary.models.find((m) => m.key === modelKey) ?? summary.models[0];
  const facts = MODEL_FACTS[model.key];
  const skills = SKILL_ORDER.flatMap((skill: Category) => {
    const rate = model.grid[context][skill]?.rate;
    return rate === undefined ? [] : [{ skill, rate, verdict: verdictFor(rate) }];
  });
  return (
    <section className="room people">
      <div className="roster">
        <p className="roster-hint">Each square is one kind of meaning. Darker means more correct.</p>
        <ul>
          {summary.models.map((m) => (
            <li key={m.key}>
              <button type="button" aria-pressed={m.key === model.key} onClick={() => onModel(m.key)}>
                <span>{m.name}</span>
                <Fingerprint model={m} context={context} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="profile">
        <h2>{facts.link ? <a href={facts.link}>{model.name}</a> : model.name}</h2>
        <p className="profile-meta">
          {facts.maker}
          {facts.year && `, ${facts.year}`}. {facts.size}.
        </p>
        <p className="profile-meta">{facts.access}.</p>
        {model.usedByApp && (
          <p className="profile-meta">Meaning Maker uses this model to compare your sentences.</p>
        )}
        <p className="profile-about">{facts.about}</p>
        {VERDICT_ORDER.map((verdict) => {
          const names = skills
            .filter((s) => s.verdict === verdict)
            .map((s) => SKILLS[s.skill].name.toLowerCase());
          return (
            names.length > 0 && (
              <p className="profile-line" key={verdict}>
                <strong>{VERDICT_NAMES[verdict]}:</strong> {listNames(names)}
              </p>
            )
          );
        })}
        <ul className="meters">
          {skills.map(({ skill, rate }) => (
            <li key={skill}>
              <button type="button" onClick={() => onEvidence({ model, category: skill, context })}>
                <span className="meter-name">{SKILLS[skill].name}</span>
                <span className="meter-track">
                  <span style={{ width: `${rate * 100}%` }} />
                </span>
                <span className="meter-value">{Math.round(rate * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
        {model.pawsAuc !== undefined && (
          <p className="profile-meta">
            Outside check: {model.pawsAuc.toFixed(2)} on PAWS, where 0.5 is guessing and 1 is perfect.
          </p>
        )}
        {facts.possibleReason && (
          <p className="profile-reason">
            <strong>A possible reason:</strong> {facts.possibleReason} This is our guess.
            No model card discusses these skills.
          </p>
        )}
        <LengthControl contexts={summary.contexts} context={context} onChange={onContext} />
        <p className="room-foot">Click a bar to see the examples behind it.</p>
      </div>
    </section>
  );
}
