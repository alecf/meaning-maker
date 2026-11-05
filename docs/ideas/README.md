# Ideas

Experiments and demos built on embeddings and language. Everything here is an unproven idea: expected results are guesses until an experiment says otherwise.

## Index

Effort: **S** needs no corpus. **M** needs a modest corpus or benchmark. **L** needs large-scale generation or several stages of work.

Nothing here is limited by the current app. Models, hosting, the stack, text limits and the app itself can all change if an idea calls for it. Where an idea mentions the app, it's a possible starting point, not a constraint.

### Understanding the models

| Idea | Question | Effort | End product |
|---|---|---|---|
| [Semantic sensitivity](semantic-sensitivity.md) | Which models notice small edits that change the meaning? | M | Model scorecard and sentence pair tester |
| [Concept orthogonality](concept-orthogonality.md) | Which concepts does a model keep separate? | M | Interactive concept heatmap |
| [Fool the embedder](fool-the-embedder.md) | Can you change the meaning without moving the vector? | M | Browser game |

### Measuring new information

| Idea | Question | Effort | End product |
|---|---|---|---|
| [Residual novelty](residual-novelty.md) | How much of a window's meaning is really new? | S | Live analysis of your text |
| [Context lift](context-lift.md) | Which sentences only make sense in context? | S | Live analysis of your text |
| [Surprise score](surprise-score.md) | How predictable was this sentence? | M | Live analysis of your text |
| [What's unique here](whats-unique-here.md) | What does this article add to others on the topic? | M | Comparison page |

### Content and style

| Idea | Question | Effort | End product |
|---|---|---|---|
| [Content and style separation](content-style-separation.md) | Can embeddings be split into content and style? | L | Results page with style explorer |
| [Custom semantic axes](custom-semantic-axes.md) | Can you score text on an axis you define by example? | S | Live analysis of your text |
| [Ghostwriter detector](ghostwriter-detector.md) | Where does the voice change inside a document? | M | Bring-your-own-text page |

### Comparing documents

| Idea | Question | Effort | End product |
|---|---|---|---|
| [Derivation detection](derivation-detection.md) | Was this document rewritten from that one? | L | Two-document comparison |
| [Meaning diff](meaning-diff.md) | What changed in meaning between two versions? | M | Two-document comparison |
| [Semantic compression](semantic-compression.md) | How much can you cut before the meaning goes? | M | Compression slider |

### Comparing writers

| Idea | Question | Effort | End product |
|---|---|---|---|
| [LLM fingerprinting](llm-fingerprinting.md) | Do LLMs have measurable voices? | L | LLM family tree |
| [Telephone game](telephone-game.md) | Where does text end up after endless paraphrasing? | M | Generation-by-generation viewer |
| [Author similarity](author-similarity.md) | Can embeddings map public domain authors by style? | M | Explorable author map |
| [Text density](text-density.md) | Can embeddings tell dense writing from sparse? | M | Results page with live scoring |
| [Story shapes](story-shapes.md) | Do texts have a recognizable shape? | M | Gallery of text shapes |

## Dependencies

[Semantic sensitivity](semantic-sensitivity.md) comes first, since it chooses the model most other ideas should use.

- [Concept orthogonality](concept-orthogonality.md) reuses its data.
- [Content and style separation](content-style-separation.md) is a test that [Ghostwriter detector](ghostwriter-detector.md) and part of [Author similarity](author-similarity.md) rely on.
- [Telephone game](telephone-game.md) generates rewrites that [Derivation detection](derivation-detection.md) needs.
- [Derivation detection](derivation-detection.md) and [Meaning diff](meaning-diff.md) share sentence alignment.
- [LLM fingerprinting](llm-fingerprinting.md) and [Content and style separation](content-style-separation.md) share a method: both analyze the same content across different writers.

## Working defaults

These are starting points, and any idea can change them.

**Windows by default.** A sentence alone can mean very little. In "Nobody would help me solve this problem, and I couldn't get anything done no matter how hard I tried. I was swimming in molasses.", the second sentence only makes sense after the first. Ideas should embed rolling windows unless they're specifically studying isolated text.

**Models that understand meaning.** These ideas care about semantics, not word overlap. A bag-of-words baseline sets the floor where it's useful.

**One model per comparison.** Vectors from different models can't be compared directly, even when they're the same size. Compare how models rank the same texts instead.

**Think about who pays for inference.** Corpus work can run in advance and ship as data. If an idea is better live, that's fine, but it needs a plan for cost and abuse.

**Public domain text.** Published corpora need to be redistributable. Modern texts can be used in experiments, but check their licenses before shipping excerpts.

## Adding an idea

Copy this template into a new file and add it to the index. If a section doesn't apply, write "None" and say why.

```markdown
# Idea name

**Status:** Idea | **Effort:** S, M or L | **Depends on:** other ideas, or none

## Introduction

What it is, and what question or problem it addresses.

## Inputs

The data, models and tools it needs.

## Assumptions

What has to be true, and how to test each one.

## Building the corpus

What has to run in advance, and how much of it. Write "None" if nothing does.

## How we'll know

The result that would confirm the idea, and the result that would kill it.

## End product

What gets published. If it's interactive, say what the user does and whether they can bring their own content.
```

**Status values:** Idea, Exploring, Validated, Rejected or Shipped. Keep rejected ideas here with what we learned.
