# Story shapes

**Status:** Idea | **Effort:** M | **Depends on:** none

## Introduction

Plot a text's path through embedding space, and compare a text against itself in a similarity grid. Callbacks and returning themes should show up as off-diagonal lines. Do novels, essays and poems have recognizable shapes, and can similar ones be clustered?

## Inputs

- Public domain texts across genres.
- Rolling windows, likely with larger steps for long works.
- A way to project paths to two dimensions, while keeping the full-dimensional grid as the main evidence.

## Assumptions

- **2D plots are honest.** Projections can invent or hide structure. Test by comparing them with full-dimensional distances.
- **Grid patterns match real structure.** Test on texts with known structure, such as a chorus, a refrain or a framed story.
- **Shapes can be compared.** Different lengths need resampling or warping. Test whether the same work's shape stays stable across window sizes.

## Building the corpus

1. Choose 100 or more works across genres.
2. Clean the texts and embed rolling windows through each.
3. Compute similarity grids and shape features.
4. Cluster the shapes.

## How we'll know

- **Confirmed:** known structures appear reliably, and shape clusters match something readers recognize.
- **Killed:** grids mostly reflect repeated names and topics, with no useful structure.

## End product

A gallery of works with interactive similarity grids. Hovering over the grid shows the two passages being compared. Users could also paste their own text, including book-length works, and see its grid.
