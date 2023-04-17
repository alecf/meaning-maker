"use client";
import { EmbedResponse } from "@/types";
import { Inter } from "next/font/google";
import { useMemo, useState } from "react";
import useSWRMutation from "swr/mutation";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  const [input, setInput] = useState("");
  const { trigger, data } = useSWRMutation("embedded", async () => {
    const response = await fetch("/api/embeddoc", {
      body: input,
      method: "POST",
    });
    const r: EmbedResponse = await response.json();
    return r;
  });

  const response = useMemo(() => {
    return data ? JSON.stringify(data, null, 2) : null;
  }, [data]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Enter text for interpreting
        </p>
        <button onClick={() => trigger()}>submit</button>
      </div>

      <div className="flex flex-1  w-full">
        <textarea
          className="flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        ></textarea>
      </div>
      <div className="flex flex-1 w-full">
        <pre>{response}</pre>
      </div>

      <div className="mb-32 grid text-center lg:mb-0 lg:grid-cols-4 lg:text-left"></div>
    </main>
  );
}
