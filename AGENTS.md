<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working in this repo

[CLAUDE.md](CLAUDE.md) has the project's stack, standards and commands. A few things that are easy to break:

- `extractBlocks` and `shadeDocument` in `src/util/document.ts` must visit text in the same order. Each block lines up with one paragraph in the `/api/embeddoc` response, so route any change to what counts as a block through `transformRuns`.
- Blocks can't contain line breaks, because the server treats each line as a paragraph.
- Keep the color tokens in `src/app/globals.css` and the opacity curve in `src/util/shading.ts` in step with `docs/index.html`.
- The sentence readout is the only place scores appear, and it has to work by hover, tap and keyboard. Don't move scores into a hover-only tooltip.
- Workers AI is remote and billed, even under `next dev`. Mock the API route when you only need to check layout.
