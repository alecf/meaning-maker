"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { Category } from "@/util/benchmark/types";
import { AboutRoom } from "./AboutRoom";
import type { PageSummary } from "./data";
import { Evidence, type EvidenceRequest } from "./Evidence";
import { ModelsRoom } from "./ModelsRoom";
import { SkillsRoom } from "./SkillsRoom";
import { TestRoom } from "./TestRoom";

const ROOMS = {
  test: "Take the test",
  skills: "What models notice",
  models: "Meet the models",
  about: "How this works",
};

type Room = keyof typeof ROOMS;

const isRoom = (value: string): value is Room => value in ROOMS;

/** Lets models glide between groups, where the browser and the reader allow it. */
function withTransition(update: () => void): void {
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (calm || document.hidden || !document.startViewTransition) {
    update();
    return;
  }
  // Rejects when a transition is skipped, which changes nothing the reader needs.
  document.startViewTransition(() => flushSync(update)).ready.catch(() => undefined);
}

export function Exhibit({ summary }: { summary: PageSummary }) {
  const [room, setRoom] = useState<Room>("test");
  const [category, setCategory] = useState<Category>("numbers");
  const [context, setContext] = useState(0);
  const [modelKey, setModelKey] = useState(
    () => summary.models.find((model) => model.usedByApp)?.key ?? summary.models[0].key,
  );
  const [evidence, setEvidence] = useState<EvidenceRequest>();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (isRoom(hash)) setRoom(hash);
  }, []);

  const closeEvidence = useCallback(() => setEvidence(undefined), []);

  const enter = (next: Room): void => {
    setRoom(next);
    window.history.replaceState(null, "", `#${next}`);
  };

  return (
    <>
      <nav className="rooms" aria-label="Exhibit">
        {(Object.keys(ROOMS) as Room[]).map((key) => (
          <button
            type="button"
            key={key}
            aria-current={room === key ? "page" : undefined}
            onClick={() => enter(key)}
          >
            {ROOMS[key]}
          </button>
        ))}
      </nav>
      {room === "test" && (
        <TestRoom
          examples={summary.examples}
          models={summary.models}
          onEvidence={setEvidence}
          onDone={() => enter("skills")}
        />
      )}
      {room === "skills" && (
        <SkillsRoom
          summary={summary}
          category={category}
          context={context}
          onCategory={(next) => withTransition(() => setCategory(next))}
          onContext={(next) => withTransition(() => setContext(next))}
          onEvidence={setEvidence}
        />
      )}
      {room === "models" && (
        <ModelsRoom
          summary={summary}
          modelKey={modelKey}
          context={context}
          onModel={setModelKey}
          onContext={setContext}
          onEvidence={setEvidence}
        />
      )}
      {room === "about" && <AboutRoom summary={summary} onEvidence={setEvidence} />}
      {evidence && (
        <Evidence
          key={`${evidence.model.key}-${evidence.category}-${evidence.context}`}
          request={evidence}
          onClose={closeEvidence}
        />
      )}
    </>
  );
}
