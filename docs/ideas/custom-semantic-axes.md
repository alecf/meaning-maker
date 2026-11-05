# Custom semantic axes

**Status:** Idea | **Effort:** S | **Depends on:** none

## Introduction

Define an axis by example, like formal to casual or concrete to abstract, then score each sentence along it. It needs no training, and it's a quick early test of whether style can be read from embeddings.

## Inputs

- A few example phrases for each end of the axis.
- An embedding model.
- Some built-in axes for people to start with.

## Assumptions

- **A concept is a direction.** This is the same assumption [Concept orthogonality](concept-orthogonality.md) tests.
- **A few examples are enough.** Test by building an axis from different example sets and checking that the scores agree.
- **Axes don't simply follow topic.** A formal axis may just detect legal subject matter. Test on the same content written both ways.

## Building the corpus

None for the feature. Built-in axes need a small test set with text at both ends.

## How we'll know

- **Confirmed:** axes rank held-out labeled text well, and different example sets give similar scores.
- **Killed:** scores are unstable, or mostly follow topic.

## End product

An interactive view. Users paste text, pick an axis or define one, and see sentences shaded along it.
