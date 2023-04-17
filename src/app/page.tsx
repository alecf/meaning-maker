"use client";
import { EmbedResponse, SentenceInfo } from "@/types";
import { scalePow } from "d3-scale";
import { Inter } from "next/font/google";
import { useState } from "react";
import useSWRMutation from "swr/mutation";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  const [input, setInput] = useState("");
  const { trigger, data, isMutating } = useSWRMutation("embedded", async () => {
    // Wikipedia references confuse the splitter
    const inputWithWikiReferencesFixed = input.replace(
      /\.(\[[0-9]+\])/g,
      ". $1"
    );
    const response = await fetch("/api/embeddoc", {
      body: inputWithWikiReferencesFixed,
      method: "POST",
    });
    const r: EmbedResponse = await response.json();
    return r;
  });

  const [min, max] = getDistanceRange(data?.response ?? []);
  const opacityScale = scalePow()
    .exponent(10)
    .domain([min, max])
    .range([0.1, 1])
    .clamp(true);
  console.log("ranging from ", min, max);
  console.log("data = ", data?.response);

  // const paragraphs = data?.response.reduce((paragraphs, sentence) => {
  //   if (sentence.sentence.)
  //   return [];
  // }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Enter text for interpreting
        </p>
        <button onClick={() => trigger()} disabled={isMutating}>
          submit {isMutating && <Spinner />}
        </button>
      </div>

      <div className="flex flex-1  w-full">
        <textarea
          className="flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        ></textarea>
      </div>
      <div className="flex-1 w-full">
        {data?.response.map((sentence, index) => {
          const opacity = index === 0 ? 1 : opacityScale(sentence.distance);
          return (
            <span style={{ color: `rgba(0,0,0,${opacity})` }} key={index}>
              {sentence.sentence}{" "}
            </span>
          );
        })}
      </div>

      <div className="mb-32 grid text-center lg:mb-0 lg:grid-cols-4 lg:text-left"></div>
    </main>
  );
}

const Spinner = () => (
  <svg
    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);

function getDistanceRange(sentences: SentenceInfo[]) {
  const distances = sentences
    .map(({ distance }) => distance)
    .filter((distance) => distance);
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  return [min, max];
}

function getPercentThroughRange(min: number, max: number, value: number) {
  const range = max - min;
  const valueInRange = value - min;
  return Math.max(valueInRange / range, 0);
}
