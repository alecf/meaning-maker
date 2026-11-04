import type { SentenceInfo } from "@/types";
import type { Element, ElementContent, Root } from "hast";
import { describe, expect, it } from "vitest";
import {
  detectFormat,
  extractBlocks,
  parseDocument,
  shadeDocument,
} from "./document";
import { extractParagraphs } from "./text";

const score = (text: string[][]): SentenceInfo[][] =>
  text.map((paragraph) =>
    paragraph.map((sentence) => ({ sentence, distance: 0.8 })),
  );

function elements(node: Root | ElementContent): Element[] {
  if (node.type !== "root" && node.type !== "element") {
    return [];
  }
  const found = node.children.flatMap((child) => elements(child as ElementContent));
  return node.type === "element" ? [node, ...found] : found;
}

const textOf = (node: Root | ElementContent): string =>
  node.type === "text"
    ? node.value
    : "children" in node
      ? node.children.map((child) => textOf(child as ElementContent)).join("")
      : "";

/** The text of each sentence, joining the spans that make it up */
function shadedText(tree: Root): string[] {
  const sentences: string[] = [];
  for (const element of elements(tree)) {
    const index = element.properties.dataSentence;
    if (typeof index === "number") {
      sentences[index] = (sentences[index] ?? "") + textOf(element);
    }
  }
  return sentences;
}

describe("detectFormat", () => {
  it.each([
    "# Heading",
    "Some **bold** text.",
    "- one\n- two",
    "> quoted",
    "Use `code` here.",
    "A [link](https://example.com) here.",
    "```\nfenced\n```",
    "| a | b |\n| - | - |\n| 1 | 2 |",
  ])("recognizes %j as markdown", (source) => {
    expect(detectFormat(source)).toBe("markdown");
  });

  it.each([
    "Just a sentence. And another.",
    "First line.\nSecond line.",
    "    An indented paragraph, as in a Project Gutenberg text.",
    "See https://example.com for more.",
    "A claim.[1] Another claim.[2]",
  ])("leaves %j as plain text", (source) => {
    expect(detectFormat(source)).toBe("plain");
  });
});

describe("parseDocument", () => {
  it("removes script URLs and raw HTML", () => {
    const tree = parseDocument(
      "[x](javascript:alert(1)) <img src=x onerror=alert(1)>",
      "markdown",
    );
    const tags = elements(tree);
    expect(tags.find((e) => e.tagName === "a")?.properties.href).toBeUndefined();
    expect(tags.some((e) => e.tagName === "img")).toBe(false);
  });

  it("opens web links in a new tab, but not footnote links", () => {
    const tree = parseDocument("[x](https://a.test) b[^1]\n\n[^1]: c", "markdown");
    const links = elements(tree).filter((e) => e.tagName === "a");
    expect(links[0].properties.target).toBe("_blank");
    expect(links[1].properties.target).toBeUndefined();
  });

  it("keeps each plain text line as a paragraph", () => {
    const tree = parseDocument("# One.\n\nTwo.\nThree.", "plain");
    expect(extractBlocks(tree)).toEqual(["# One.", "Two.", "Three."]);
  });
});

describe("extractBlocks", () => {
  it("strips markup and keeps one block per line", () => {
    const tree = parseDocument(
      `# A **bold** title

Wrapped across
two [lines](https://a.test).

- one
- two
  - nested

> quoted

\`\`\`
const skipped = true;
\`\`\`

| a | b |
| - | - |`,
      "markdown",
    );
    expect(extractBlocks(tree)).toEqual([
      "A bold title",
      "Wrapped across two lines.",
      "one",
      "two",
      "nested",
      "quoted",
      "a",
      "b",
    ]);
  });

  it("separates lines joined by a hard break", () => {
    const tree = parseDocument("One line.  \nAnother line.", "markdown");
    expect(extractBlocks(tree)).toEqual(["One line. Another line."]);
  });

  it("spaces out Wikipedia references", () => {
    const tree = parseDocument("A claim.[1] More.", "plain");
    expect(extractBlocks(tree)).toEqual(["A claim. [1] More."]);
  });
});

describe("shadeDocument", () => {
  it("does not modify the parsed tree", () => {
    const tree = parseDocument("One. Two.", "plain");
    const before = structuredClone(tree);
    shadeDocument(tree, score([["One.", "Two."]]));
    expect(tree).toEqual(before);
  });

  it("splits a sentence across inline formatting", () => {
    const tree = parseDocument("One **two. Three** four.", "markdown");
    const { tree: shaded } = shadeDocument(tree, score([["One two.", "Three four."]]));
    expect(shadedText(shaded)).toEqual(["One two.", "Three four."]);
    const spans = elements(shaded).filter((e) => e.tagName === "span");
    expect(spans.map((span) => span.properties.tabIndex)).toEqual([0, -1, 0, -1]);
  });

  it("wraps an inline element whole when it fits in one sentence", () => {
    const tree = parseDocument("Run `npm test` now.", "markdown");
    const { tree: shaded } = shadeDocument(tree, score([["Run npm test now."]]));
    const [span] = elements(shaded).filter((e) => e.tagName === "span");
    expect(elements(span).some((e) => e.tagName === "code")).toBe(true);
    expect(elements(shaded).filter((e) => e.tagName === "span")).toHaveLength(1);
  });

  it("leaves text the server dropped unshaded and in place", () => {
    const tree = parseDocument("Short.\nA longer sentence here.", "plain");
    const { tree: shaded } = shadeDocument(
      tree,
      score([[], ["A longer sentence here."]]),
    );
    expect(textOf(shaded)).toBe("Short.A longer sentence here.");
    expect(shadedText(shaded)).toEqual(["A longer sentence here."]);
  });

  it("matches sentences the server merged or respaced", () => {
    const tree = parseDocument("Hi.  There you are.[1] Next.", "plain");
    const { tree: shaded } = shadeDocument(
      tree,
      score([["Hi. There you are. [1]", "Next."]]),
    );
    expect(shadedText(shaded)).toEqual(["Hi.  There you are.[1]", "Next."]);
  });

  it("reports the change between sentences", () => {
    const tree = parseDocument("One.\nTwo.\nThree.", "plain");
    const { sentences } = shadeDocument(tree, [
      [{ sentence: "One.", distance: 0 }],
      [{ sentence: "Two.", distance: 0.5 }],
      [{ sentence: "Three.", distance: 0.75 }],
    ]);
    expect(sentences.map(({ change }) => change)).toEqual([null, null, 0.25]);
  });

  it("lines up with the real sentence splitter on markdown", async () => {
    const tree = parseDocument(
      `## Why **it** matters

Dr. Smith said it *twice. And then* again, in \`code\`.
It went on for a [while](https://a.test).

- A list item that says something.
- Another item that says more. Then it adds a second sentence.`,
      "markdown",
    );
    const paragraphs = await extractParagraphs(extractBlocks(tree).join("\n"));
    const { tree: shaded } = shadeDocument(tree, score(paragraphs));
    expect(shadedText(shaded)).toEqual(paragraphs.flat());
  });
});
