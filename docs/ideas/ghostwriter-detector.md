# Ghostwriter detector

**Status:** Idea | **Effort:** M | **Depends on:** [Content and style separation](content-style-separation.md)

## Introduction

Find points in a single document where the writing voice changes. This partly avoids the main limit of [Derivation detection](derivation-detection.md): it needs no original to compare against.

It would suit multi-author documents, pasted passages, and text where a person and an LLM took turns.

## Inputs

- Style axes, if [Content and style separation](content-style-separation.md) produces any that work.
- Test documents with known authorship changes.
- A change-point detection method.

## Assumptions

- **Style survives inside a window.** Style signals may be too weak at this scale. Test on stitched passages from two authors.
- **Topic changes aren't mistaken for voice changes.** Test with documents where the topic changes but the author doesn't.
- **False accusations are the main risk.** Any published result should show evidence and uncertainty. It shouldn't produce a verdict about a person.

## Building the corpus

1. Stitch together passages from different public domain authors at known points.
2. Add same-author documents with topic changes as negatives.
3. Add passages rewritten by an LLM inside human text.

## How we'll know

- **Confirmed:** it finds known changes with few false alarms, on documents with topic changes as well.
- **Killed:** it can't separate topic changes from author changes.

## End product

A page where users paste a document and see likely voice changes on a timeline. It would open with curated examples.
