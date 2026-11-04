import type { SentenceInfo } from "@/types";
import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { Nodes as MdastNodes } from "mdast";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { sentenceOpacities } from "./shading";

/**
 * A pasted document is parsed once, into one tree, and that tree drives both
 * halves of an analysis: `extractBlocks` pulls out clean prose for embedding,
 * so scores aren't skewed by `**` or URLs, and `shadeDocument` lays the scored
 * sentences back over the same tree, so a sentence can span bold text or a link.
 */

export type TextFormat = "markdown" | "plain";

export interface ScoredSentence {
  /** Cosine similarity to the preceding text (`SentenceInfo.distance`) */
  similarity: number;
  /** Change from the previous sentence; null when there's nothing to compare */
  change: number | null;
  opacity: number;
}

export interface ShadedDocument {
  tree: HastRoot;
  sentences: ScoredSentence[];
}

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize);

/** Where a text run stops: these elements hold flow content, not inline text */
const FLOW_TAGS = new Set(
  "p h1 h2 h3 h4 h5 h6 blockquote ul ol li table thead tbody tr td th section".split(
    " ",
  ),
);
/** Flow elements with no sentences to score */
const UNSCORED_TAGS = new Set(["pre", "hr"]);

/** Formatting that plain prose doesn't produce by accident */
const MARKDOWN_NODE_TYPES = new Set(
  "heading list blockquote table strong emphasis inlineCode image thematicBreak".split(
    " ",
  ),
);

function isMarkdownSyntax(node: MdastNodes, source: string): boolean {
  if (MARKDOWN_NODE_TYPES.has(node.type)) {
    return true;
  }
  const start = node.position?.start.offset ?? 0;
  if (node.type === "code") {
    // Unfenced code is usually just an indented paragraph
    return /^(```|~~~)/.test(source.slice(start));
  }
  if (node.type === "link") {
    // Not a bare URL, which GFM links automatically
    return source[start] === "[";
  }
  return false;
}

function containsMarkdownSyntax(node: MdastNodes, source: string): boolean {
  return (
    isMarkdownSyntax(node, source) ||
    ("children" in node &&
      node.children.some((child) => containsMarkdownSyntax(child, source)))
  );
}

export function detectFormat(source: string): TextFormat {
  return containsMarkdownSyntax(markdownProcessor.parse(source), source)
    ? "markdown"
    : "plain";
}

function paragraph(line: string): Element {
  return {
    type: "element",
    tagName: "p",
    properties: {},
    children: [{ type: "text", value: line }],
  };
}

function openLinksInNewTab(parent: HastRoot | Element): void {
  for (const child of parent.children) {
    if (child.type !== "element") {
      continue;
    }
    if (child.tagName === "a" && /^https?:/.test(`${child.properties.href}`)) {
      child.properties.target = "_blank";
      child.properties.rel = ["noreferrer"];
    }
    openLinksInNewTab(child);
  }
}

export function parseDocument(source: string, format: TextFormat): HastRoot {
  if (format === "plain") {
    return {
      type: "root",
      children: source
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map(paragraph),
    };
  }
  const tree = markdownProcessor.runSync(markdownProcessor.parse(source));
  openLinksInNewTab(tree);
  return tree;
}

function runText(nodes: ElementContent[]): string {
  return nodes.map(nodeText).join("");
}

function nodeText(node: ElementContent): string {
  if (node.type === "text") {
    return node.value;
  }
  if (node.type !== "element") {
    return "";
  }
  return node.tagName === "br" ? " " : runText(node.children);
}

/**
 * Replace each run of inline content that has text in it, in document order.
 * Runs correspond one-to-one with the paragraphs in the server's response.
 */
function transformRuns(
  parent: HastRoot | Element,
  transform: (run: ElementContent[]) => ElementContent[],
): void {
  const children: (typeof parent.children)[number][] = [];
  let run: ElementContent[] = [];
  const flush = () => {
    children.push(...(runText(run).trim() ? transform(run) : run));
    run = [];
  };

  for (const child of parent.children) {
    if (child.type === "doctype") {
      continue;
    }
    const isFlow =
      child.type === "element" &&
      (FLOW_TAGS.has(child.tagName) || UNSCORED_TAGS.has(child.tagName));
    if (!isFlow) {
      run.push(child);
      continue;
    }
    flush();
    if (!UNSCORED_TAGS.has(child.tagName)) {
      transformRuns(child, transform);
    }
    children.push(child);
  }
  flush();
  parent.children = children;
}

/** The document's text, one block per entry, none spanning a line. */
export function extractBlocks(tree: HastRoot): string[] {
  const blocks: string[] = [];
  transformRuns(tree, (run) => {
    blocks.push(
      runText(run)
        .replace(/\s+/g, " ")
        .trim()
        // Wikipedia references confuse the sentence splitter
        .replace(/\.(\[[0-9]+\])/g, ". $1"),
    );
    return run;
  });
  return blocks;
}

interface SentenceRange {
  start: number;
  end: number;
  /** Index into `ShadedDocument.sentences` */
  sentence: number;
}

/**
 * Find sentences in a block, in order. Whitespace is ignored because the
 * server's text can differ from ours there: it joins very short sentences with
 * a space, and references get one added. Sentences that it dropped for being
 * too short simply aren't asked for, so they stay unshaded.
 */
function locateSentences(
  text: string,
  sentences: { text: string; sentence: number }[],
): SentenceRange[] {
  const positions: number[] = [];
  let squeezed = "";
  for (let index = 0; index < text.length; index++) {
    if (!/\s/.test(text[index])) {
      squeezed += text[index];
      positions.push(index);
    }
  }

  const ranges: SentenceRange[] = [];
  let cursor = 0;
  for (const { text: sentenceText, sentence } of sentences) {
    const needle = sentenceText.replace(/\s+/g, "");
    const at = needle ? squeezed.indexOf(needle, cursor) : -1;
    if (at === -1) {
      continue;
    }
    cursor = at + needle.length;
    ranges.push({
      start: positions[at],
      end: positions[cursor - 1] + 1,
      sentence,
    });
  }
  return ranges;
}

/**
 * Rebuild a run with its sentences wrapped. Nodes that fit inside one sentence
 * are wrapped whole, so inline code keeps its background with its text; nodes
 * that cross a boundary are split, so one sentence can produce several spans.
 */
function wrapSentences(
  nodes: ElementContent[],
  ranges: SentenceRange[],
  wrap: (range: SentenceRange, children: ElementContent[]) => Element,
  startOffset = 0,
): ElementContent[] {
  const result: ElementContent[] = [];
  let group: { range: SentenceRange; children: ElementContent[] } | null = null;
  const flushGroup = () => {
    if (group) {
      result.push(wrap(group.range, group.children));
      group = null;
    }
  };
  const add = (node: ElementContent, range: SentenceRange | undefined) => {
    if (!range) {
      flushGroup();
      result.push(node);
      return;
    }
    if (group?.range !== range) {
      flushGroup();
      group = { range, children: [] };
    }
    group?.children.push(node);
  };

  let offset = startOffset;
  for (const node of nodes) {
    const end = offset + nodeText(node).length;
    const overlapping = ranges.filter((r) => r.start < end && r.end > offset);
    const [first] = overlapping;
    if (
      !first ||
      (overlapping.length === 1 && first.start <= offset && end <= first.end)
    ) {
      add(node, first);
    } else if (node.type === "text") {
      let cut = offset;
      for (const range of overlapping) {
        if (range.start > cut) {
          add(textBetween(node.value, offset, cut, range.start), undefined);
        }
        const stop = Math.min(range.end, end);
        add(textBetween(node.value, offset, Math.max(cut, range.start), stop), range);
        cut = stop;
      }
      if (cut < end) {
        add(textBetween(node.value, offset, cut, end), undefined);
      }
    } else if (node.type === "element") {
      flushGroup();
      result.push({
        ...node,
        children: wrapSentences(node.children, ranges, wrap, offset),
      });
    }
    offset = end;
  }
  flushGroup();
  return result;
}

function textBetween(
  value: string,
  valueOffset: number,
  start: number,
  end: number,
): ElementContent {
  return {
    type: "text",
    value: value.slice(start - valueOffset, end - valueOffset),
  };
}

/** A copy of `tree` with each scored sentence wrapped in a shaded span. */
export function shadeDocument(
  tree: HastRoot,
  paragraphs: SentenceInfo[][],
): ShadedDocument {
  const similarities = paragraphs.flat().map(({ distance }) => distance);
  const opacities = sentenceOpacities(similarities);
  const sentences = similarities.map((similarity, index) => ({
    similarity,
    change: index < 2 ? null : similarity - similarities[index - 1],
    opacity: opacities[index],
  }));

  const shaded = structuredClone(tree);
  const wrapped = new Set<number>();
  const wrap = ({ sentence }: SentenceRange, children: ElementContent[]) => {
    const element: Element = {
      type: "element",
      tagName: "span",
      properties: {
        className: ["sent"],
        dataSentence: sentence,
        // Reachable by tab once per sentence, however many spans it takes
        tabIndex: wrapped.has(sentence) ? -1 : 0,
        style: `--o:${sentences[sentence].opacity.toFixed(3)};--i:${sentence}`,
      },
      children,
    };
    wrapped.add(sentence);
    return element;
  };

  let block = 0;
  let sentence = 0;
  transformRuns(shaded, (run) => {
    const blockSentences = (paragraphs[block++] ?? []).map(({ sentence: text }) => ({
      text,
      sentence: sentence++,
    }));
    return wrapSentences(
      run,
      locateSentences(runText(run), blockSentences),
      wrap,
    );
  });
  return { tree: shaded, sentences };
}
