"use client";

import { useState } from "react";

const VIEWS = {
  hoped: {
    label: "What we hope for",
    caption:
      "A model that follows meaning puts the rewording close by, even though it shares few words, and sends the edit away.",
    same: { x: 230, y: 75 },
    changed: { x: 500, y: 180 },
  },
  words: {
    label: "What word overlap sees",
    caption:
      "A model that leans on wording does the reverse. The edit keeps nearly every word, so it lands right beside the original.",
    same: { x: 500, y: 70 },
    changed: { x: 310, y: 165 },
  },
};

type View = keyof typeof VIEWS;

const ANCHOR = { x: 120, y: 130 };

/** An illustration of the idea. No model's numbers are behind it. */
export function MeaningMap() {
  const [view, setView] = useState<View>("hoped");
  const { caption, same, changed } = VIEWS[view];
  return (
    <figure className="map">
      <fieldset className="segmented">
        <legend className="sr-only">Choose a view of the map</legend>
        {(Object.keys(VIEWS) as View[]).map((key) => (
          <button
            type="button"
            key={key}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {VIEWS[key].label}
          </button>
        ))}
      </fieldset>
      <svg viewBox="0 0 640 250" role="img" aria-label={caption}>
        <line className="map-link map-link-same" x1={ANCHOR.x} y1={ANCHOR.y} x2={same.x} y2={same.y} />
        <line className="map-link map-link-changed" x1={ANCHOR.x} y1={ANCHOR.y} x2={changed.x} y2={changed.y} />
        <g className="map-point" style={{ transform: `translate(${ANCHOR.x}px, ${ANCHOR.y}px)` }}>
          <circle r="9" className="map-anchor" />
          <text y="30" textAnchor="middle">The vaccine protects</text>
          <text y="48" textAnchor="middle">infants…</text>
        </g>
        <g className="map-point" style={{ transform: `translate(${same.x}px, ${same.y}px)` }}>
          <circle r="9" className="map-same" />
          <text y="-36" textAnchor="middle">Babies are shielded…</text>
          <text y="-18" textAnchor="middle" className="map-note">same meaning</text>
        </g>
        <g className="map-point" style={{ transform: `translate(${changed.x}px, ${changed.y}px)` }}>
          <circle r="9" className="map-changed" />
          <text y="28" textAnchor="middle">…does not protect…</text>
          <text y="46" textAnchor="middle" className="map-note">changed meaning</text>
        </g>
      </svg>
      <figcaption>{caption} This map is a sketch, not a measurement.</figcaption>
    </figure>
  );
}
