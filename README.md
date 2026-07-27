# Meaning Maker

A web app that analyzes text and visualizes how much new information each sentence introduces, using OpenAI embeddings and cosine similarity.

## How it works

Paste any text (up to 3,000 characters) and click **Submit**. Each sentence is rendered with an opacity proportional to how semantically novel it is compared to the preceding context — faded sentences are repeating ideas already covered, bright sentences are introducing new information.

Under the hood:

1. The text is split into sentences and paragraphs.
2. Each sentence is embedded using a rolling window of the preceding N sentences (configurable via **Window size**, default 8), producing a single embedding that captures local context.
3. Cosine similarity is computed between each window's embedding and the previous one.
4. Sentences with high similarity (low distance from prior context) are rendered at low opacity; sentences with low similarity (high distance) render at full opacity.
5. Embeddings are cached in Upstash Redis to avoid redundant API calls.

Hover over any sentence to see the raw similarity distance and the delta from the previous sentence.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **UI:** Chakra UI + Emotion
- **Embeddings:** OpenAI `text-embedding-3-small`
- **Cache:** Upstash Redis (via `@upstash/redis`)
- **Testing:** Vitest

## Getting Started

### Prerequisites

- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- An [Upstash Redis](https://upstash.com/) database (free tier works fine)

### Setup

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` file with your credentials:

   ```
   OPENAI_API_KEY=sk-...
   KV_REST_API_URL=https://...upstash.io
   KV_REST_API_TOKEN=...
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Common Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Run Biome linter
npm run lint:fix  # Run Biome linter and apply safe fixes
npm run typecheck # Check TypeScript types
npm test          # Run Vitest tests
```

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
