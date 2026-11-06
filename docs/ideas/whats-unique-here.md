# What's unique here

**Status:** Idea | **Effort:** M | **Depends on:** [Residual novelty](residual-novelty.md) would provide the method

## Introduction

Take several articles about one event. Which sentences in this article add something the others don't? This applies the app's "new information" idea across documents instead of within one.

## Inputs

- Groups of articles on the same event or topic.
- An embedding model and rolling windows.
- Sentence matching across documents.

## Assumptions

- **Unique means informative.** Unusual phrasing could score as unique without adding anything. Test by having people review high-scoring sentences.
- **Coverage can be measured with embeddings.** Test on articles with a known extra fact inserted.
- **Texts can be published.** News is usually copyrighted. Public domain histories or Wikipedia versions may work better for a static page.

## Building the corpus

1. Collect 3 to 5 groups of related documents with licenses that allow publishing.
2. Split and embed them with rolling windows.
3. Score each passage against the other documents in its group.

## How we'll know

- **Confirmed:** inserted facts are found reliably, and reviewers agree that top passages add something.
- **Killed:** top scores are mostly quirks of wording.

## End product

A comparison page where passages are shaded by how unique they are. It starts with curated document sets. A later version could let users paste 2 to 5 texts of their own.
