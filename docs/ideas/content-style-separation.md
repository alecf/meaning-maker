# Content and style separation

**Status:** Idea | **Effort:** L | **Depends on:** [Semantic sensitivity](semantic-sensitivity.md), to choose the model

## Introduction

Hypothesis: an embedding combines content and style, and the two can be teased apart. If the same content appears in many styles, what varies with content and what varies with style?

The simplest model is:

```
embedding = overall mean + content effect + style effect + leftover
```

The size of each part directly tests the hypothesis. Subtracting each content item's mean and running PCA on the remainder gives candidate style axes. ICA is a closer match if we think of this as un-mixing sources.

The Fourier comparison is apt in one way: PCA also finds a basis, but it learns that basis from the data, where Fourier uses a fixed one.

## Inputs

- A grid of the same content across many styles.
- Human-written sources, to avoid mistaking one LLM's voice for style: public domain Bible translations (KJV, ASV, Darby, Young's Literal, World English Bible), multiple Homer translations, and Wikipedia paired with Simple English Wikipedia.
- LLM rewrites, as a second source.
- The model chosen by [Semantic sensitivity](semantic-sensitivity.md).

## Assumptions

- **Effects roughly add together.** Style may not be one fixed direction, and its effect may depend on the content. Test with the consistency check from [Concept orthogonality](concept-orthogonality.md).
- **The model keeps style at all.** Models trained on meaning may suppress it. The variance split will show this.
- **Translators aren't one style.** A translation mixes a translator, an era and a language. Test by comparing several from the same era.
- **Results depend on genre.** Fiction, poetry and reference text may behave differently. Report them separately.

## Building the corpus

1. Align human sources at verse, line or paragraph level. Verses make the Bible the easiest start.
2. Build rolling windows from aligned passages.
3. Generate LLM rewrites in a fixed set of styles, using more than one LLM.
4. Embed everything and store it with content and style labels.
5. Run the variance split, then PCA and ICA, separately for each genre.

## How we'll know

- **Confirmed:** style accounts for a meaningful share of variance, and style vectors learned from some texts work on unseen ones. A nearest-neighbor test is the fair check, because embeddings can't be turned back into text.
- **Killed:** style variance is about the same as noise, or style axes only work on the texts they were learned from.

## End product

A results page explaining the variance split, with an interactive style explorer. Users pick a passage and a style shift, then see the nearest real passages. Bringing your own text could come later, if style axes hold up on unseen text.
