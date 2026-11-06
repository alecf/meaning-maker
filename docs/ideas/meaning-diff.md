# Meaning diff

**Status:** Idea | **Effort:** M | **Depends on:** [Semantic sensitivity](semantic-sensitivity.md)

## Introduction

A diff that ignores rewording and shows what changed in meaning. It would suit terms of service, policies, contracts and edited news stories, where a small edit can matter more than a large rewrite.

## Inputs

- Pairs of document versions.
- A model that scores well on negation, numbers and quantifiers in [Semantic sensitivity](semantic-sensitivity.md).
- Sentence alignment, shared with [Derivation detection](derivation-detection.md).

## Assumptions

- **The model notices small but important edits.** This is the riskiest assumption. Changing "may" to "must" is exactly the type of edit embeddings can miss. Test with the benchmark's categories.
- **Alignment holds up.** Test on documents with moved and split sentences.
- **An LLM may be needed for the last step.** Embeddings could find candidates while an LLM explains each change.

## Building the corpus

Only a test set: real public version pairs, such as Wikipedia revisions and public policy updates, plus synthetic edits with known changes.

## How we'll know

- **Confirmed:** it flags meaning changes while ignoring rewording better than a word diff.
- **Killed:** it misses important small edits, which would make it worse than a word diff for its main use.

## End product

An interactive page. Users paste two versions and see them aligned, with meaning changes highlighted and rewording dimmed.
