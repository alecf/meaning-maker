# Concept orthogonality

**Status:** Idea | **Effort:** M | **Depends on:** [Semantic sensitivity](semantic-sensitivity.md)

## Introduction

Meaning doesn't live in individual embedding columns. It's spread across all of them, and few concepts are likely to be truly independent: fact vs fiction and truth vs lies probably overlap, for example.

This idea measures how a model arranges concepts. Does changing the sentiment of a sentence move it in the same direction as changing the formality? Does negation even have a direction?

It could also hint at what differs between models, and maybe at something like how rich a model's representation is. That second part is speculative.

## Inputs

- Minimal pairs for each concept: negation, tense, sentiment, formality, certainty, fact vs fiction and others.
- The same models as [Semantic sensitivity](semantic-sensitivity.md).
- Offline analysis using cosine similarity and PCA.

## Assumptions

- **A concept behaves like a direction.** This may be false. Take the difference vector of each pair: if they point the same way across many pairs, the concept is direction-like. If they scatter, its effect depends on the content, which is a finding in its own right.
- **Angles need a baseline.** Random vectors in high dimensions are nearly orthogonal anyway, so compare every angle with a shuffled baseline.
- **Pair choice doesn't drive the result.** Test by computing directions from separate pair sets and checking that they agree.
- **Behavior says something about model complexity.** It might not, since a model's training goal also shapes these results. Treat any claim about complexity as a hypothesis.

## Building the corpus

1. Write 50 or more minimal pairs per concept, across varied topics.
2. Embed each pair with each model.
3. Compute consistency for each concept, then the angles between concepts.
4. Compute a rough effective dimension for each model: how many principal components explain most of the variance.

## How we'll know

- **Confirmed:** some concepts have consistent directions, and the pattern of angles repeats on separate pair sets.
- **Killed:** directions scatter for nearly every concept, or angles can't be told apart from the shuffled baseline. Then concepts aren't directions in these models.

## End product

An interactive heatmap of concept angles, one per model, with a model switcher. Clicking a concept shows its most and least consistent pairs. Users explore precomputed results, and don't bring their own content.
