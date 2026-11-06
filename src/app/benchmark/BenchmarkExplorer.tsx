"use client";

import { useRef, useState } from "react";
import type { Category } from "@/util/benchmark/types";
import type {
  CountedInterval,
  DetailTriplet,
  PageDetails,
  PageModel,
  PageSummary,
} from "./data";
import { CATEGORIES, CATEGORY_ORDER } from "./labels";
import { MarginAxis, marginPosition } from "./MarginAxis";

const DETAILS_URL = "/benchmark/details.json";
const WORD_COUNTS = "bag-of-words";
/** Dots closer than this, in percentage points, stack instead of overlapping. */
const DOT_SPACING = 3.5;

type Origin = "scoreboard" | "categories" | "grid" | "filler";

interface View {
  id: string;
  label: string;
  /** Follows the model's name in a sentence. */
  phrase: string;
  context: number;
  category?: Category;
  interval(model: PageModel): CountedInterval | undefined;
}

interface Selection {
  model: PageModel;
  view: View;
  origin: Origin;
}

const percent = (rate: number): string => `${Math.round(rate * 100)}%`;

const filler = (sentences: number): string =>
  sentences === 1 ? "1 sentence of filler" : `${sentences} sentences of filler`;

const ALL: View = {
  id: "all",
  label: "All",
  phrase: "across every kind of change",
  context: 0,
  interval: (model) => model.overall,
};

const categoryView = (category: Category): View => ({
  id: category,
  label: CATEGORIES[category].name,
  phrase: `on ${CATEGORIES[category].name.toLowerCase()}`,
  context: 0,
  category,
  interval: (model) => model.categories[category],
});

const fillerView = (context: number): View => ({
  id: `context-${context}`,
  label: String(context),
  phrase: context === 0 ? "on bare sentences" : `with ${filler(context)}`,
  context,
  interval: (model) => model.contexts[context],
});

function Scoreboard({
  models,
  onSelect,
}: {
  models: PageModel[];
  onSelect(selection: Selection): void;
}) {
  return (
    <div className="board">
      <div className="board-scale" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((tick) => (
          <span key={tick} style={{ left: `${tick}%` }}>
            {tick}%
          </span>
        ))}
      </div>
      <ul>
        {models.map((model) => (
          <li key={model.key}>
            <button
              type="button"
              className={model.usedByApp ? "board-row board-row-app" : "board-row"}
              onClick={() => onSelect({ model, view: ALL, origin: "scoreboard" })}
              aria-label={`${model.name}: ${percent(model.overall.rate)}, likely between ${percent(model.overall.low)} and ${percent(model.overall.high)}`}
            >
              <span className="board-name">
                {model.name}
                {model.usedByApp && <span className="board-tag">Used by this app</span>}
              </span>
              <span className="board-track">
                <span
                  className="board-range"
                  style={{
                    left: `${model.overall.low * 100}%`,
                    width: `${(model.overall.high - model.overall.low) * 100}%`,
                  }}
                />
                <span
                  className="board-dot"
                  style={{ left: `${model.overall.rate * 100}%` }}
                />
              </span>
              <span className="board-value">{percent(model.overall.rate)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stacks dots that would overlap into rows, keeping each at its true rate. */
function stack(models: PageModel[], view: View): { model: PageModel; rate: number; row: number }[] {
  const rows: number[] = [];
  return models
    .flatMap((model) => {
      const value = view.interval(model);
      return value ? [{ model, rate: value.rate }] : [];
    })
    .sort((a, b) => a.rate - b.rate)
    .map(({ model, rate }) => {
      const position = rate * 100;
      let row = rows.findIndex((last) => position - last >= DOT_SPACING);
      if (row === -1) row = rows.length;
      rows[row] = position;
      return { model, rate, row };
    });
}

/** Names the model at an extreme, or counts them when several tie there. */
function extreme(dots: { model: PageModel; rate: number }[], rate: number): string {
  const tied = dots.filter((dot) => dot.rate === rate);
  const who = tied.length > 1 ? `${tied.length} models` : tied[0].model.name;
  return `${who} ${percent(rate)}`;
}

function CategoryStrips({
  models,
  onSelect,
}: {
  models: PageModel[];
  onSelect(selection: Selection): void;
}) {
  const embedding = models.filter((model) => model.key !== WORD_COUNTS);
  return (
    <ul className="strips">
      {CATEGORY_ORDER.map((category) => {
        const view = categoryView(category);
        const dots = stack(embedding, view);
        const best = dots[dots.length - 1].rate;
        const worst = dots[0].rate;
        const height = (Math.max(...dots.map((d) => d.row)) + 1) * 15;
        return (
          <li key={category}>
            <h3>{CATEGORIES[category].name}</h3>
            <p className="strip-example">{CATEGORIES[category].example}</p>
            <div className="strip-track" style={{ height }}>
              {dots.map(({ model, rate, row }) => (
                <button
                  type="button"
                  key={model.key}
                  className={model.usedByApp ? "strip-dot strip-dot-app" : "strip-dot"}
                  style={{ left: `${rate * 100}%`, bottom: row * 15 }}
                  title={`${model.name}: ${percent(rate)}`}
                  aria-label={`${model.name} ${view.phrase}: ${percent(rate)}`}
                  onClick={() => onSelect({ model, view, origin: "categories" })}
                />
              ))}
            </div>
            <p className="strip-range">
              <span>{extreme(dots, worst)}</span>
              <span>{extreme(dots, best)}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function Heatmap({
  views,
  models,
  selected,
  hasPaws,
  onSelect,
}: {
  views: View[];
  models: PageModel[];
  selected?: Selection;
  hasPaws: boolean;
  onSelect(selection: Selection): void;
}) {
  return (
    <div className="heatmap-scroll">
      <table className="heatmap">
        <caption>Pass rate by model and kind of change, in percent</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            {views.map((view) => (
              <th scope="col" key={view.id}>
                {view.label}
              </th>
            ))}
            {hasPaws && <th scope="col">PAWS AUC</th>}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.key}>
              <th scope="row">
                <span className="heatmap-model">{model.name}</span>
                <span className="heatmap-source">
                  {model.usedByApp ? "Used by this app" : model.source}
                </span>
              </th>
              {views.map((view) => {
                const value = view.interval(model);
                if (!value) return <td key={view.id}>–</td>;
                const description = `${model.name} ${view.phrase}: ${percent(value.rate)}`;
                return (
                  <td key={view.id}>
                    <button
                      type="button"
                      className="cell"
                      style={{ "--rate": value.rate } as React.CSSProperties}
                      aria-pressed={
                        selected?.model.key === model.key && selected.view.id === view.id
                      }
                      aria-label={description}
                      title={description}
                      onClick={() => onSelect({ model, view, origin: "grid" })}
                    >
                      {Math.round(value.rate * 100)}
                    </button>
                  </td>
                );
              })}
              {hasPaws && (
                <td className="heatmap-plain">
                  {model.pawsAuc === undefined ? "–" : model.pawsAuc.toFixed(2)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CHART_WIDTH = 120;
const CHART_HEIGHT = 80;
const CHART_INSET = 5;

function FillerGrid({
  models,
  contexts,
  onSelect,
}: {
  models: PageModel[];
  contexts: number[];
  onSelect(selection: Selection): void;
}) {
  const x = (i: number): number =>
    CHART_INSET + (i / (contexts.length - 1)) * (CHART_WIDTH - 2 * CHART_INSET);
  const y = (rate: number): number =>
    CHART_INSET + (1 - rate) * (CHART_HEIGHT - 2 * CHART_INSET);
  const longest = contexts[contexts.length - 1];
  return (
    <ul className="filler">
      {models.map((model) => {
        const rates = contexts.map((context) => model.contexts[context].rate);
        const points = rates.map((rate, i) => `${x(i)},${y(rate)}`).join(" ");
        return (
          <li key={model.key}>
            <button
              type="button"
              aria-label={`${model.name}: ${percent(rates[0])} on bare sentences, ${percent(rates[rates.length - 1])} with ${filler(longest)}`}
              onClick={() =>
                onSelect({ model, view: fillerView(longest), origin: "filler" })
              }
            >
              <span className="filler-name">{model.name}</span>
              <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} aria-hidden="true">
                <line className="filler-mid" x1={0} x2={CHART_WIDTH} y1={y(0.5)} y2={y(0.5)} />
                <polyline className="filler-line" points={points} />
                <circle className="filler-end" cx={x(rates.length - 1)} cy={y(rates[rates.length - 1])} r="3.5" />
              </svg>
              <span className="filler-values">
                <span>{percent(rates[0])}</span>
                <span>{percent(rates[rates.length - 1])}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface Row extends DetailTriplet {
  margin: number;
  passed: boolean;
}

function rowsFor(details: PageDetails, { model, view }: Selection): Row[] {
  const { margins, passed } = details.scores[model.key][view.context];
  return details.triplets
    .map((triplet, i) => ({ ...triplet, margin: margins[i], passed: passed[i] === "1" }))
    .filter((row) => !view.category || row.category === view.category)
    .sort((a, b) => a.margin - b.margin);
}

function Detail({
  selection,
  details,
  failed,
  onClose,
}: {
  selection: Selection;
  details?: PageDetails;
  failed: boolean;
  onClose(): void;
}) {
  const { model, view } = selection;
  const value = view.interval(model) as CountedInterval;
  const rows = details ? rowsFor(details, selection) : [];
  const passes = Math.round(value.rate * value.count);
  return (
    <section className="detail" aria-live="polite">
      <div className="detail-head">
        <h3>
          {model.name} {view.phrase}
        </h3>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </div>
      <p>
        Right on {passes} of {value.count} ({percent(value.rate)}). With this few
        sets, the true rate is likely between {percent(value.low)} and{" "}
        {percent(value.high)}.
      </p>
      {view.context > 0 && (
        <p>Each text below also had {filler(view.context)} in front of it.</p>
      )}
      {failed && (
        <p role="alert">The sets couldn&apos;t load. Reload the page to try again.</p>
      )}
      {!details && !failed && <p>Loading the sets…</p>}
      {rows.length > 0 && (
        <>
          <MarginAxis />
          <div className="detail-strip" aria-hidden="true">
            {rows.map((row) => (
              <span
                key={row.anchor}
                className={row.passed ? "dot dot-right" : "dot dot-fooled"}
                style={{ left: `${marginPosition(row.margin)}%` }}
                title={row.anchor}
              />
            ))}
          </div>
          <p className="detail-hint">
            Each dot is one set. Margin is how much closer the rewording came than
            the edit. The biggest misses come first.
          </p>
          <ol className="detail-list">
            {rows.map((row) => (
              <li key={row.anchor}>
                <p className="detail-verdict">
                  {row.passed ? "Right" : "Fooled"}, margin {row.margin > 0 ? "+" : ""}
                  {row.margin.toFixed(3)}
                </p>
                <dl className="trio">
                  <div>
                    <dt>Sentence</dt>
                    <dd>{row.anchor}</dd>
                  </div>
                  <div>
                    <dt>Same meaning</dt>
                    <dd>{row.paraphrase}</dd>
                  </div>
                  <div>
                    <dt>Changed meaning</dt>
                    <dd>{row.edit}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export function BenchmarkExplorer({ summary }: { summary: PageSummary }) {
  const [selected, setSelected] = useState<Selection>();
  const [details, setDetails] = useState<PageDetails>();
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);
  const hasPaws = summary.models.some((model) => model.pawsAuc !== undefined);
  const views = [
    ALL,
    ...CATEGORY_ORDER.filter((c) => summary.categories.includes(c)).map(categoryView),
  ];

  const select = (selection: Selection): void => {
    setSelected(selection);
    if (details || loading.current) return;
    loading.current = true;
    setFailed(false);
    fetch(DETAILS_URL)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<PageDetails>;
      })
      .then(setDetails)
      .catch(() => setFailed(true))
      .finally(() => {
        loading.current = false;
      });
  };

  const detailFor = (origin: Origin) =>
    selected?.origin === origin && (
      <Detail
        selection={selected}
        details={details}
        failed={failed}
        onClose={() => setSelected(undefined)}
      />
    );

  return (
    <>
      <h2>The scoreboard</h2>
      <p>
        The share of all {summary.tripletCount} sets each model got right. The
        shaded bar is the margin of error, so models whose bars overlap may not
        really differ. Click a model to see its sets.
      </p>
      <Scoreboard models={summary.models} onSelect={select} />
      {detailFor("scoreboard")}

      <h2>Some changes are harder than others</h2>
      <p>
        Each dot is one embedding model, placed by its score on that kind of
        change. Further right is better. The ringed dot is the model this app
        uses.
      </p>
      <CategoryStrips models={summary.models} onSelect={select} />
      {detailFor("categories")}
      <details className="drill">
        <summary>Every model and every kind of change</summary>
        <Heatmap
          views={views}
          models={summary.models}
          selected={selected}
          hasPaws={hasPaws}
          onSelect={select}
        />
        {detailFor("grid")}
      </details>

      <h2>Longer text blurs the difference</h2>
      <p>
        The same sets again, with up to {summary.contexts[summary.contexts.length - 1]}{" "}
        neutral sentences in front. Each line runs from bare sentences on the left
        to the most filler on the right, and the dashed line marks 50%. Most fall,
        some hold up, and a couple climb.
      </p>
      <FillerGrid
        models={summary.models}
        contexts={summary.contexts}
        onSelect={select}
      />
      {detailFor("filler")}

      {!hasPaws && (
        <p className="bench-pending">
          Still to come: an outside check using PAWS, a public dataset of paraphrases
          built from scrambled sentences.
        </p>
      )}
    </>
  );
}
