# Meaning Maker - Development Guidelines

## Project Overview

Meaning Maker is a Next.js application that analyzes text to gauge how much new information appears in each sentence, using OpenAI embeddings and cosine similarity.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **UI:** Chakra UI + Emotion
- **AI:** OpenAI embeddings API
- **Database:** Upstash Redis (for embedding cache)
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

### Testing

- Tests live alongside source files or in a top-level `__tests__/` directory.
- Run tests with `npm test`.
- Write tests for utility functions and business logic at minimum.
- Mock external dependencies (OpenAI API, Redis) in tests.

### Linting & Formatting

- Biome is the linter, configured in `biome.jsonc` (it must be `.jsonc`, not
  `.json` — Biome parses `biome.json` as strict JSON and rejects comments).
- Next.js and React coverage comes from Biome's `next` and `react` rule
  domains, which replace the old `next/core-web-vitals` ESLint config.
- The formatter is enabled (spaces, 2-wide, to match the existing code) and is
  enforced in CI. Assist (import sorting) stays disabled.
- Run `npm run lint` before committing — it runs `biome check`, covering both
  lint rules and formatting. `npm run lint:fix` applies safe fixes and
  reformats; `npm run format` reformats only.
- Run `npm run typecheck` to verify TypeScript types.

## Common Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Run Biome lint + format check
npm run lint:fix     # Apply safe lint fixes and reformat
npm run format       # Reformat only
npm run typecheck    # Run TypeScript type checking
npm test             # Run tests
```

## Environment Variables

The following environment variables are required at runtime:

- `OPENAI_API_KEY` — OpenAI API key for embeddings
- `KV_REST_API_URL` — Upstash Redis REST URL
- `KV_REST_API_TOKEN` — Upstash Redis REST token
