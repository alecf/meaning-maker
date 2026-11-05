# Author similarity

**Status:** Idea | **Effort:** M | **Depends on:** [Semantic sensitivity](semantic-sensitivity.md)

## Introduction

Analyze public domain authors' works using embedding patterns. Which authors write alike, and can embeddings see influence or a shared school of writing?

Windows can give more than an average position. They also show how a writer moves: how far they travel per sentence, how often they return to earlier ideas, and how much ground they cover.

## Inputs

- Project Gutenberg texts by many authors, with several works per author, across genres where possible.
- A model chosen by [Semantic sensitivity](semantic-sensitivity.md).
- Style axes, if [Content and style separation](content-style-separation.md) produces them.
- A baseline using function-word frequencies, a standard stylometry method.

## Assumptions

- **Similarity reflects style, not subject.** Authors who share topics may look alike. Test whether an author's novels match their own essays better than another author's novels from the same period.
- **Era and genre don't dominate.** Compare authors within one period and genre.
- **Translators don't blur the result.** Translated work may reflect the translator. Keep it separate, or start with English originals only.
- **Samples are representative.** Whole books exceed most models' input limits, so use many sampled windows per work.

## Building the corpus

1. Choose about 50 authors, with several works each.
2. Clean Gutenberg headers, footers and front matter.
3. Sample windows evenly through each work.
4. Embed them, then compute position and movement features for each work.
5. Test attribution on held-out works.

## How we'll know

- **Confirmed:** held-out works are matched to their authors across genres, beating or adding to the function-word baseline.
- **Killed:** clusters only reflect topic or era.

## End product

An explorable map of authors and works. Users zoom in, compare two authors and read sample passages. Later, users could paste a passage and see which authors it most resembles.
