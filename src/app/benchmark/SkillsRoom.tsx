"use client";

import type { Category } from "@/util/benchmark/types";
import type { PageModel, PageSummary } from "./data";
import type { EvidenceRequest } from "./Evidence";
import { SKILL_ORDER, SKILLS } from "./labels";
import { LengthControl } from "./LengthControl";
import { VERDICT_NAMES, VERDICT_ORDER, type Verdict, verdictFor } from "./verdict";

const WORD_COUNTS = "bag-of-words";

function group(models: PageModel[], category: Category, context: number) {
  const groups: Record<Verdict, { model: PageModel; rate: number }[]> = {
    notices: [],
    mixed: [],
    misses: [],
  };
  for (const model of models) {
    const rate = model.grid[context][category]?.rate;
    if (rate !== undefined) groups[verdictFor(rate)].push({ model, rate });
  }
  for (const verdict of VERDICT_ORDER) groups[verdict].sort((a, b) => b.rate - a.rate);
  return groups;
}

export function SkillsRoom({
  summary,
  category,
  context,
  onCategory,
  onContext,
  onEvidence,
}: {
  summary: PageSummary;
  category: Category;
  context: number;
  onCategory(category: Category): void;
  onContext(context: number): void;
  onEvidence(request: EvidenceRequest): void;
}) {
  const models = summary.models.filter((model) => model.key !== WORD_COUNTS);
  const groups = group(models, category, context);
  const wordCounts = summary.models.find((m) => m.key === WORD_COUNTS);
  const baseline = wordCounts?.grid[context][category]?.rate;
  return (
    <section className="room">
      <fieldset className="skills">
        <legend className="sr-only">Choose a kind of meaning</legend>
        {SKILL_ORDER.map((skill) => {
          const counts = group(models, skill, context);
          return (
            <button type="button" key={skill} aria-pressed={skill === category} onClick={() => onCategory(skill)}>
              <span className="skill-name">{SKILLS[skill].name}</span>
              <span className="sr-only">
                {counts.notices.length} of {models.length} usually notice
              </span>
              <span className="tally" aria-hidden="true">
                {VERDICT_ORDER.flatMap((verdict) =>
                  counts[verdict].map(({ model }) => <span key={model.key} className={`tally-${verdict}`} />),
                )}
              </span>
            </button>
          );
        })}
      </fieldset>
      <h2 className="room-question">{SKILLS[category].question}</h2>
      <p className="room-insight">{SKILLS[category].insight}</p>
      <div className="bins">
        {VERDICT_ORDER.map((verdict) => (
          <div className={`bin bin-${verdict}`} key={verdict}>
            <h3>
              {VERDICT_NAMES[verdict]} <span>{groups[verdict].length}</span>
            </h3>
            {groups[verdict].length === 0 && <p className="bin-empty">No models</p>}
            <ul className="chips">
              {groups[verdict].map(({ model, rate }) => (
                <li key={model.key}>
                  <button
                    type="button"
                    className="chip"
                    style={{ viewTransitionName: `chip-${models.indexOf(model)}` }}
                    onClick={() => onEvidence({ model, category, context })}
                  >
                    {model.name} <span>{Math.round(rate * 100)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <LengthControl contexts={summary.contexts} context={context} onChange={onContext} />
      <p className="room-foot">
        Percentages are correct answers on about 20 tests, so a model near the edge of
        a group could belong in the next one.
        {baseline !== undefined &&
          ` Just counting shared words gets ${Math.round(baseline * 100)}%.`}{" "}
        Click a model to see its examples.
      </p>
    </section>
  );
}
