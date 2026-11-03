# Meaning Maker - Development Guidelines

## Project Overview

Meaning Maker is a Next.js application that analyzes text to gauge how much new information appears in each sentence, using Workers AI embeddings and cosine similarity. It runs on Cloudflare Workers via OpenNext.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict mode)
- **UI:** Chakra UI + Emotion
- **AI:** Workers AI `@cf/baai/bge-large-en-v1.5` embeddings via the AI SDK (`ai`) and `workers-ai-provider`
- **Cache:** Workers KV (embedding cache)
- **Hosting:** Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`); deployed by Workers Builds
- **Testing:** Vitest

## Code Standards

### General Principles

- **DRY (Don't Repeat Yourself):** Extract shared logic into reusable functions. Avoid copy-pasting code blocks.
- **SOLID Principles:**
  - **Single Responsibility:** Each function and module should do one thing well.
  - **Open/Closed:** Prefer extending behavior over modifying existing working code.
  - **Liskov Substitution:** Subtypes should be substitutable for their base types.
  - **Interface Segregation:** Keep interfaces small and focused.
  - **Dependency Inversion:** Depend on abstractions, not concretions.
- **KISS (Keep It Simple):** Favor straightforward solutions over clever ones.
- **YAGNI (You Aren't Gonna Need It):** Don't build for hypothetical future requirements.

### TypeScript

- Strict mode is enabled — do not weaken type checks.
- Use explicit types for function parameters and return values on exported functions.
- Prefer `interface` for object shapes, `type` for unions/intersections.
- Avoid `any`; use `unknown` and narrow with type guards when the type is truly dynamic.

### Code Organization

- `src/app/` — Next.js App Router pages, layouts, and API routes.
- `src/util/` — Shared utility functions and helpers.
- `src/types.ts` — Shared TypeScript type definitions.
- Keep server-only code (API routes, DB access) separate from client components.
- `wrangler.jsonc` — Worker config and bindings. `open-next.config.ts` — OpenNext adapter config.
- `cloudflare-env.d.ts` — generated binding types (`CloudflareEnv`). Run `npm run cf-typegen` after editing `wrangler.jsonc`; don't edit it by hand.

### Testing

- Tests live alongside source files or in a top-level `__tests__/` directory.
- Run tests with `npm test`.
- Write tests for utility functions and business logic at minimum.
- Mock external dependencies (Workers AI, KV) in tests.

### Linting & Formatting

- Biome is the linter, configured in `biome.jsonc` (it must be `.jsonc`, not
  `.json` — Biome parses `biome.json` as strict JSON and rejects comments).
- Next.js and React coverage comes from Biome's `next` and `react` rule
  domains, which replace the old `next/core-web-vitals` ESLint config.
- The formatter and assist (import sorting) are deliberately disabled, since
  the previous ESLint setup enforced neither.
- Run `npm run lint` before committing; `npm run lint:fix` applies safe fixes.
- Run `npm run typecheck` to verify TypeScript types.

## Common Commands

```bash
npm run dev          # Start dev server (bindings via initOpenNextCloudflareForDev)
npm run build        # Plain next build (the OpenNext build runs this)
npm run preview      # OpenNext build + run locally in workerd
npm run deploy       # OpenNext build + deploy (normally done by Workers Builds)
npm run cf-typegen   # Regenerate cloudflare-env.d.ts from wrangler.jsonc
npm run lint         # Run Biome linter
npm run lint:fix     # Run Biome linter and apply safe fixes
npm run typecheck    # Run TypeScript type checking
npm test             # Run tests
```

## Cloudflare Bindings

There are no runtime secrets or environment variables. Server code reads
bindings with `getCloudflareContext()` from `@opennextjs/cloudflare`:

- `AI` — Workers AI. It always runs remotely, even under `next dev`, so local
  dev needs `npx wrangler login` and uses real (billed) inference.
- `EMBED_CACHE` — KV namespace for the embedding cache. Local dev simulates it
  in `.wrangler/`. In production Wrangler auto-provisions it (no `id` in
  `wrangler.jsonc`).

Never run `wrangler deploy` or other account-mutating commands unless asked;
`npx wrangler deploy --dry-run` is safe for checking bundle size (Workers
limit: 3 MiB gzip on the free plan, 10 MiB on paid).
