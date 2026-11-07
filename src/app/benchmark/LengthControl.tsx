"use client";

const describe = (sentences: number): string =>
  sentences === 0
    ? "A single sentence"
    : `With ${sentences} unrelated ${sentences === 1 ? "sentence" : "sentences"} in front`;

export function LengthControl({
  contexts,
  context,
  onChange,
}: {
  contexts: number[];
  context: number;
  onChange(context: number): void;
}) {
  const position = contexts.indexOf(context);
  return (
    <label className="length">
      <span className="length-label">Longer text: {describe(context)}</span>
      <input
        type="range"
        min={0}
        max={contexts.length - 1}
        step={1}
        value={position}
        aria-valuetext={describe(context)}
        onChange={(event) => onChange(contexts[Number(event.target.value)])}
      />
    </label>
  );
}
