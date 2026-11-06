/** Margins past this sit at the edge of the chart. */
const MAX_MARGIN = 0.4;

/** Where a margin falls across its track, as a percentage from the left. */
export function marginPosition(margin: number): number {
  const clamped = Math.max(-MAX_MARGIN, Math.min(MAX_MARGIN, margin));
  return 50 + (clamped / MAX_MARGIN) * 50;
}

export function MarginAxis() {
  return (
    <div className="axis-labels" aria-hidden="true">
      <span>← Fooled: edit looked closer</span>
      <span>Right: rewording looked closer →</span>
    </div>
  );
}
