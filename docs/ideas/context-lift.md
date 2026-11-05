# Context lift

**Status:** Idea | **Effort:** S | **Depends on:** none

## Introduction

Some sentences mean something quite different alone than they do in place. In "Nobody would help me solve this problem, and I couldn't get anything done no matter how hard I tried. I was swimming in molasses.", the metaphor alone is about molasses. In context, it adds a little nuance to the frustration before it.

Context lift compares two things:

- How far the sentence sits from the preceding text when it's embedded alone.
- How far it moves the window when it's added to that text.

A large gap means the sentence depends on context. Metaphors, references like "it", and sarcasm should all score highly.

## Inputs

- An embedding model and rolling windows.
- One extra embedding per sentence, for the standalone version.
- Labeled examples of figurative and literal sentences for testing.

## Assumptions

- **Models handle context this way.** The window embedding has to absorb the metaphor's intended meaning. Test on hand-written pairs of metaphors and literal sentences.
- **The gap isn't just length.** Short sentences may always score highly. Test by controlling for length.
- **Window size matters.** One sentence has less effect on a larger window, so the score needs normalizing. Test several sizes.

## Building the corpus

Only a small labeled test set: about 50 sentences each of figurative and literal text, in context.

## How we'll know

- **Confirmed:** figurative and context-dependent sentences reliably rank above literal ones with similar length.
- **Killed:** the score mainly tracks sentence length or topic changes.

## End product

An interactive view that highlights context-dependent sentences in the user's own text.
