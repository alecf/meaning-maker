# Meaning Maker

A web app that analyzes text and visualizes how much new information each sentence introduces, using Workers AI embeddings and cosine similarity.

For an interactive explanation of how it works, with real examples, see [alecf.com/meaning-maker](https://alecf.com/meaning-maker/).

## How it works

Paste any text (up to 3,000 characters) and click **Submit**. Each sentence is rendered with an opacity proportional to how semantically novel it is compared to the preceding context — faded sentences are repeating ideas already covered, bright sentences are introducing new information.

Under the hood:

1. The text is split into sentences and paragraphs.
2. Each sentence is embedded using a rolling window of the preceding N sentences (configurable via **Window size**, default 8), producing a single embedding that captures local context.
3. Cosine similarity is computed between each window's embedding and the previous one.
4. Sentences with high similarity (low distance from prior context) are rendered at low opacity; sentences with low similarity (high distance) render at full opacity.
5. Embeddings are cached in Workers KV to avoid redundant model calls.

Hover over any sentence to see the raw similarity distance and the delta from the previous sentence.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict mode)
- **UI:** Chakra UI + Emotion
- **Embeddings:** Workers AI `@cf/baai/bge-large-en-v1.5`, called through the [AI SDK](https://ai-sdk.dev/) and `workers-ai-provider`
- **Cache:** Workers KV (`EMBED_CACHE` binding)
- **Hosting:** Cloudflare Workers, via the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare)
- **Testing:** Vitest

## Getting Started

### Prerequisites

- Node.js 22+ (`.nvmrc` pins 24)
- A Cloudflare account. No API keys or `.env` files are needed: the app reaches Workers AI and KV through the bindings in `wrangler.jsonc`.

### Setup

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Log in to Cloudflare. Workers AI has no local simulator, so even `npm run dev` calls the real models on your account (and is billed as Workers AI usage):

   ```bash
   npx wrangler login
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

In dev, `initOpenNextCloudflareForDev()` in `next.config.js` exposes the bindings to `getCloudflareContext()`. The `AI` binding runs remotely; the `EMBED_CACHE` KV namespace is simulated locally and persisted under `.wrangler/`.

## Common Commands

```bash
npm run dev         # Start the Next.js dev server (with Cloudflare bindings)
npm run build       # Plain `next build` (also run by the OpenNext build)
npm run preview     # Build for Workers and run it locally in workerd
npm run deploy      # Build for Workers and deploy (needs `wrangler login`)
npm run cf-typegen  # Regenerate cloudflare-env.d.ts after editing wrangler.jsonc
npm run lint        # Run Biome linter
npm run lint:fix    # Run Biome linter and apply safe fixes
npm run typecheck   # Check TypeScript types
npm test            # Run Vitest tests
npm run explainer:data  # Regenerate docs/data.json for the explainer (needs `wrangler login`)
```

## Explainer page

`docs/` is a static page served by GitHub Pages at [alecf.com/meaning-maker](https://alecf.com/meaning-maker/). `docs/index.html` loads `docs/data.json`, which `scripts/build-explainer-data.ts` generates by running the app's own sentence splitting, windowing and Workers AI embedder over a few public-domain texts. Rerun `npm run explainer:data` after changing the model or windowing so the page stays accurate. To preview locally, serve the folder (e.g. `npx serve docs`), since the page fetches its data.

## Deploying

Production deploys run on [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), which builds and deploys on every push to `main`. To set it up once in the Cloudflare dashboard:

1. Go to **Workers & Pages** > **Create** > **Import a repository**, and connect this GitHub repo.
2. Set the project name to `meaning-maker`. It must match `name` in `wrangler.jsonc`.
3. Set **Build command** to `npx opennextjs-cloudflare build`.
4. Set **Deploy command** to `npx opennextjs-cloudflare deploy`.
5. Optional: to build other branches too, enable builds for non-production branches and set their command to `npx opennextjs-cloudflare upload`. It uploads a new version with its own preview URL without deploying it to production.

You don't need any build or runtime variables. The build uses Node from `.nvmrc`. On the first deploy, Wrangler auto-provisions the KV namespace (named `meaning-maker-embed-cache`) because `wrangler.jsonc` gives no `id`. Later deploys reuse it.

GitHub Actions CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, and the OpenNext build. It doesn't deploy.

## API

### `POST /api/embeddoc`

Analyzes a block of text and returns per-sentence similarity distances.

**Query parameters:**

| Parameter | Default | Description |
|---|---|---|
| `window_size` | `8` | Number of preceding sentences included in the rolling context window |
| `min_token_length` | `3` | Minimum token count for a sentence fragment to be included |

**Request body:** URL-encoded plain text.

**Response:**

```json
{
  "response": [
    [
      { "sentence": "First sentence.", "distance": 0 },
      { "sentence": "Second sentence.", "distance": 0.821 }
    ]
  ]
}
```

The outer array is paragraphs; the inner array is sentences within each paragraph. `distance` is the cosine similarity score between the current window and the previous one (0 = identical, 1 = completely different).
