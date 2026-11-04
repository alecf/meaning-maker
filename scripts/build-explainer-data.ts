/**
 * Generates docs/data.json for the explainer page (docs/index.html).
 *
 * Runs the app's own sentence splitting, windowing and Workers AI embedder
 * over a few public-domain texts, so the page shows exactly what the app
 * computes. Needs `npx wrangler login` (Workers AI is always remote).
 *
 *   npm run explainer:data
 */
import { writeFileSync } from "node:fs";
import type { Embedder } from "@/util/embedding";
import {
  extractParagraphs,
  getAllSentences,
  iterateTextWindows,
} from "@/util/text";
import {
  EMBEDDING_CONFIG,
  createWorkersAIEmbedder,
} from "@/util/workersAiEmbedder";
import { getPlatformProxy } from "wrangler";

const WINDOW_SIZES = [1, 2, 4, 8];
const MIN_TOKEN_LENGTH = 3;

interface Example {
  id: string;
  title: string;
  source: string;
  /** Paragraphs separated by blank lines; line breaks inside are unwrapped. */
  text: string;
}

const EXAMPLES: Example[] = [
  {
    id: "gettysburg",
    title: "The Gettysburg Address",
    source: "Abraham Lincoln, 1863",
    text: `Four score and seven years ago, our fathers brought forth upon this continent a new nation: conceived in liberty, and dedicated to the proposition that all men are created equal.

Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battlefield of that war.

We have come to dedicate a portion of that field as a final resting place for those who here gave their lives that this nation might live. It is altogether fitting and proper that we should do this.

But, in a larger sense, we cannot dedicate, we cannot consecrate, we cannot hallow this ground. The brave men, living and dead, who struggled here have consecrated it, far above our poor power to add or detract. The world will little note, nor long remember, what we say here, but it can never forget what they did here.

It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced. It is rather for us to be here dedicated to the great task remaining before us: that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion; that we here highly resolve that these dead shall not have died in vain; that this nation, under God, shall have a new birth of freedom; and that government of the people, by the people, for the people, shall not perish from this earth.`,
  },
  {
    id: "declaration",
    title: "The Declaration of Independence",
    source: "Second paragraph and the first grievances, run together as on the engrossed parchment, 1776",
    text: `We hold these truths to be self-evident, that all men are created equal, that they are endowed by their Creator with certain unalienable Rights, that among these are Life, Liberty, and the pursuit of Happiness. That to secure these rights, Governments are instituted among Men, deriving their just powers from the consent of the governed, That whenever any Form of Government becomes destructive of these ends, it is the Right of the People to alter or to abolish it, and to institute new Government, laying its foundation on such principles and organizing its powers in such form, as to them shall seem most likely to effect their Safety and Happiness. Prudence, indeed, will dictate that Governments long established should not be changed for light and transient causes; and accordingly all experience hath shown, that mankind are more disposed to suffer, while evils are sufferable, than to right themselves by abolishing the forms to which they are accustomed. But when a long train of abuses and usurpations, pursuing invariably the same Object evinces a design to reduce them under absolute Despotism, it is their right, it is their duty, to throw off such Government, and to provide new Guards for their future security. Such has been the patient sufferance of these Colonies; and such is now the necessity which constrains them to alter their former Systems of Government. The history of the present King of Great Britain is a history of repeated injuries and usurpations, all having in direct object the establishment of an absolute Tyranny over these States. To prove this, let Facts be submitted to a candid world. He has refused his Assent to Laws, the most wholesome and necessary for the public good. He has forbidden his Governors to pass Laws of immediate and pressing importance, unless suspended in their operation till his Assent should be obtained; and when so suspended, he has utterly neglected to attend to them. He has refused to pass other Laws for the accommodation of large districts of people, unless those people would relinquish the right of Representation in the Legislature, a right inestimable to them and formidable to tyrants only. He has called together legislative bodies at places unusual, uncomfortable, and distant from the depository of their Public Records, for the sole purpose of fatiguing them into compliance with his measures. He has dissolved Representative Houses repeatedly, for opposing with manly firmness his invasions on the rights of the people.`,
  },
  {
    id: "ishmael-darwin",
    title: "Moby-Dick, then On the Origin of Species",
    source:
      "Herman Melville, 1851, followed by Charles Darwin, 1859: two openings placed back to back",
    text: `Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people's hats off, then, I account it high time to get to sea as soon as I can. This is my substitute for pistol and ball. With a philosophical flourish Cato throws himself upon his sword; I quietly take to the ship. There is nothing surprising in this. If they but knew it, almost all men in their degree, some time or other, cherish very nearly the same feelings towards the ocean with me.

When on board H.M.S. Beagle, as naturalist, I was much struck with certain facts in the distribution of the inhabitants of South America, and in the geological relations of the present to the past inhabitants of that continent. These facts seemed to me to throw some light on the origin of species, that mystery of mysteries, as it has been called by one of our greatest philosophers. On my return home, it occurred to me, in 1837, that something might perhaps be made out on this question by patiently accumulating and reflecting on all sorts of facts which could possibly have any bearing on it. After five years' work I allowed myself to speculate on the subject, and drew up some short notes; these I enlarged in 1844 into a sketch of the conclusions, which then seemed to me probable: from that period to the present day I have steadily pursued the same object.`,
  },
];

/** A tiny trio for the "a sentence becomes a vector" section. */
const VECTOR_DEMO = [
  "The cat sat on the mat.",
  "The cat was sitting on the mat.",
  "Quarks and gluons interact strongly.",
];

function cosine(a: number[], b: number[]): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return ab / Math.sqrt(aa * bb);
}

/** Project vectors onto their top two principal components (power iteration). */
function pca2(vectors: number[][]): [number, number][] {
  const n = vectors.length;
  const d = vectors[0].length;
  const mean = new Array<number>(d).fill(0);
  for (const v of vectors) for (let i = 0; i < d; i++) mean[i] += v[i] / n;
  const centered = vectors.map((v) => v.map((x, i) => x - mean[i]));

  const components: number[][] = [];
  for (let c = 0; c < 2; c++) {
    let w = Array.from({ length: d }, (_, i) => Math.sin(i * 7.13 + c + 1));
    for (let iter = 0; iter < 200; iter++) {
      // w <- X^T X w, with earlier components deflated out
      const proj = centered.map((row) => row.reduce((s, x, i) => s + x * w[i], 0));
      const next = new Array<number>(d).fill(0);
      centered.forEach((row, r) => {
        for (let i = 0; i < d; i++) next[i] += row[i] * proj[r];
      });
      for (const prev of components) {
        const dot = next.reduce((s, x, i) => s + x * prev[i], 0);
        for (let i = 0; i < d; i++) next[i] -= dot * prev[i];
      }
      const norm = Math.hypot(...next) || 1;
      w = next.map((x) => x / norm);
    }
    components.push(w);
  }
  return centered.map((row) => {
    const [x, y] = components.map((w) => row.reduce((s, v, i) => s + v * w[i], 0));
    return [round(x), round(y)];
  });
}

const round = (x: number, digits = 4) => Number(x.toFixed(digits));

/** Wraps an embedder and remembers every vector it produced, keyed by text. */
function recording(embedder: Embedder) {
  const seen = new Map<string, number[]>();
  const wrapped: Embedder = {
    id: embedder.id,
    async embed(text) {
      const cached = seen.get(text);
      if (cached) return cached;
      const v = await embedder.embed(text);
      seen.set(text, v);
      return v;
    },
  };
  return { embedder: wrapped, seen };
}

async function main() {
  const { env, dispose } = await getPlatformProxy<CloudflareEnv>();
  try {
    const { embedder, seen } = recording(createWorkersAIEmbedder(env.AI));

    const examples = [];
    for (const ex of EXAMPLES) {
      console.log(`embedding ${ex.id}`);
      const paragraphs = await extractParagraphs(ex.text);

      const similarity: Record<number, number[]> = {};
      const path: Record<number, [number, number][]> = {};
      let sentences: { text: string; paragraph: number }[] = [];
      // Window membership per sentence: index of the first sentence in its window.
      const windowStart: Record<number, number[]> = {};
      // Window-vs-window similarity: matrix[size][i][j] compares the window
      // ending at sentence i with the one ending at sentence j. The app's score
      // for sentence i is matrix[size][i][i - 1].
      const matrix: Record<number, number[][]> = {};

      for (const size of WINDOW_SIZES) {
        const result = await getAllSentences(
          paragraphs,
          embedder,
          size,
          MIN_TOKEN_LENGTH,
        );
        sentences = result.flatMap((para, p) =>
          para.map((s) => ({ text: s.sentence, paragraph: p })),
        );
        similarity[size] = result.flat().map((s) => round(s.distance));

        // Recover each window's text (and its vector) the same way the app built it.
        const windowVectors: number[][] = [];
        const starts: number[] = [];
        let offset = 0;
        for (const para of paragraphs) {
          let i = 0;
          for await (const { accumulated } of iterateTextWindows(
            para,
            size,
            MIN_TOKEN_LENGTH,
          )) {
            const v = seen.get(accumulated);
            if (!v) throw new Error(`no vector recorded for window: ${accumulated}`);
            windowVectors.push(v);
            const idx = offset + i;
            // Windows within a paragraph cover up to `size` sentences ending here.
            starts.push(Math.max(offset, idx - size + 1));
            i++;
          }
          offset += i;
        }
        path[size] = pca2(windowVectors);
        windowStart[size] = starts;
        matrix[size] = windowVectors.map((a) =>
          windowVectors.map((b) => round(cosine(a, b), 3)),
        );
      }

      examples.push({
        id: ex.id,
        title: ex.title,
        source: ex.source,
        sentences,
        similarity,
        windowStart,
        path,
        matrix,
      });
    }

    const demoVectors: number[][] = [];
    for (const text of VECTOR_DEMO) {
      demoVectors.push(await embedder.embed(text));
    }
    const vectorDemo = {
      sentences: VECTOR_DEMO,
      vectors: demoVectors.map((v) => v.map((x) => round(x, 3))),
      similarity: demoVectors.map((a) => demoVectors.map((b) => round(cosine(a, b), 3))),
    };

    const data = {
      model: EMBEDDING_CONFIG.model,
      dimensions: demoVectors[0].length,
      windowSizes: WINDOW_SIZES,
      defaultWindowSize: 8,
      vectorDemo,
      examples,
    };
    writeFileSync("docs/data.json", `${JSON.stringify(data)}\n`);
    console.log(`wrote docs/data.json (${JSON.stringify(data).length} bytes)`);
  } finally {
    await dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
