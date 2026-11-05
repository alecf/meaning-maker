# Text density

**Status:** Idea | **Effort:** M | **Depends on:** [Semantic sensitivity](semantic-sensitivity.md)

## Introduction

Can embedding patterns show how dense a text is, or how hard it is to read? One measure is how far the rolling window moves per token. Another is how often the text returns to earlier ideas.

Readability formulas only count syllables and sentence lengths. This could capture how much content a text packs in, though dense and difficult aren't the same thing.

## Inputs

- Texts at known reading levels, including Wikipedia paired with Simple English Wikipedia.
- Rolling windows.
- Flesch-Kincaid scores as the baseline.

## Assumptions

- **Movement reflects density.** A rambling text could move around a lot without saying much. Test by comparing with human ratings.
- **Density relates to difficulty.** They may differ: a children's story can move quickly. Report them as separate claims.
- **Genre doesn't dominate.** Compare within genres first.

## Building the corpus

1. Collect leveled texts and matched Wikipedia pairs.
2. Embed them in rolling windows at several sizes.
3. Compute density features, then compare them with reading levels and human ratings.

## How we'll know

- **Confirmed:** density features predict reading level or human ratings better than Flesch-Kincaid, or add to it.
- **Killed:** they add nothing beyond a formula that only counts syllables and sentences.

## End product

A results page ranking well-known public domain texts by density. If it holds up, a live density score for the user's own text.
