# Fool the embedder

**Status:** Idea | **Effort:** M | **Depends on:** none, though [Semantic sensitivity](semantic-sensitivity.md) would supply good starting examples

## Introduction

A game that teaches what embeddings miss. There are two challenges:

- Make the smallest edit that reverses the meaning but barely moves the vector.
- Make the biggest rewrite that keeps the meaning and barely moves the vector.

## Inputs

- A curated set of starting sentences.
- One or more embedding models that can run live.
- A way to check that the meaning really changed, or really stayed the same.

## Assumptions

- **Players can't cheat easily.** The vector score alone can't confirm meaning, which is the point of the game. Scoring needs an LLM judge or an entailment model. Test by trying to fool the judge too.
- **It's fun for more than a minute.** Test with a rough prototype before polishing it.
- **Live inference stays cheap.** Each attempt costs an embedding call, and possibly an LLM call. Rate limiting may be needed.

## Building the corpus

Only a small one: 20 to 50 starting sentences, with a few examples of strong answers.

## How we'll know

- **Confirmed:** testers play several rounds, and can describe something embeddings get wrong afterward.
- **Killed:** one trick beats every round, or the judge is too unreliable to trust.

## End product

An interactive browser game. Users type their own edits against provided sentences, and see vector distance and the judge's verdict. A shared leaderboard is optional.
