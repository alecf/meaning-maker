# Semantic sensitivity

**Status:** Exploring | **Effort:** M | **Depends on:** none | **Design:** [plan](../plans/2026-11-05-semantic-sensitivity-design.md)

## Introduction

Which embedding models understand meaning, and which mostly track the words on the page? Small edits can reverse a sentence's meaning while leaving almost every word in place, which makes them a good probe.

Each test is a triplet:

| Role | Example |
|---|---|
| Anchor | The dog bit the man. |
| Same meaning, different words | The man was bitten by the dog. |
| Different meaning, nearly the same words | The man bit the dog. |

A model passes if the paraphrase is closer to the anchor than the edit is. Raw distance isn't enough, because a good model may still keep a negated sentence nearby: it shares the topic.

Running this across categories gives each model a profile of what it notices. This also picks the model for most other ideas.

## Inputs

- **Test set:** hand-reviewed triplets covering negation, swapped roles, quantifiers, numbers, antonyms and negation scope, at both sentence and paragraph length.
- **Existing data:** PAWS, a paraphrase dataset built around word-scrambled pairs, as an outside check.
- **Models:** as wide a range of embedding models as possible, from any provider, plus open models we can run ourselves.
- **Baseline:** a bag-of-words model, as the floor for "only looking at words".
- **Pooling:** how token vectors are combined can matter. bge recommends `cls`, for example, while the current app gets mean pooling. Test both.

## Assumptions

- **Triplets reflect real understanding.** Test by checking whether scores hold up on PAWS as well as our own set.
- **Scores measure sensitivity, not depth.** Many models are trained for search, where keeping "did" and "did not" together is sensible. A low score may reflect the training goal. We should compare scores with what's published about each model's purpose before drawing conclusions.
- **Small differences are real.** Test with Wilson confidence intervals across triplets.
- **Sentence results carry over to paragraphs.** An edit is diluted in longer text, so test this at several lengths.

## Building the corpus

1. Write about 100 triplets across the categories, with an LLM drafting candidates and a person reviewing each one.
2. Add paragraph versions by placing the same edits in surrounding text.
3. Embed everything with each model and store the vectors. These can be reused by [Concept orthogonality](concept-orthogonality.md).
4. Compute pass rates by category and model.

## How we'll know

- **Confirmed:** models differ clearly and consistently by category, and the bag-of-words baseline scores far below the semantic models.
- **Killed:** all semantic models score about the same, or results change randomly between test sets.

## End product

An interactive results page:

- A heatmap of models by category, with pass rates.
- Click a cell to see the triplets each model passed and failed.
- A box to enter your own sentences and see how each model scores them.
