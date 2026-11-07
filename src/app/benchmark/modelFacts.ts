export interface ModelFacts {
  /** The model card, or the vendor's documentation for hosted models. */
  link?: string;
  maker: string;
  year?: number;
  /** Open models can be downloaded. Hosted models can only be called. */
  access: string;
  /** Where the size comes from: Ollama's download, or Hugging Face for all-mpnet. */
  size: string;
  /** Sourced from the card or vendor docs, in our words. */
  about: string;
  /** Our inference. No source discusses negation, numbers or word order. */
  possibleReason?: string;
}

const LAPTOP = "Ran on a laptop through Ollama, a free tool for running models locally";
const CLOUDFLARE = "Open model. We ran it on Cloudflare's hosted AI service, which is how this site calls it";
const PAID = "Paid service, reached through OpenRouter, which resells model APIs";

const BGE_LARGE = "https://huggingface.co/BAAI/bge-large-en-v1.5";
const BGE_ABOUT =
  "An English model from a project focused on search. It's trained on large sets of matching pairs, and its card says only the relative order of scores matters, not their size.";
const POOLING =
  "A model produces one vector per word, and pooling squashes them into one.";

export const MODEL_FACTS: Record<string, ModelFacts> = {
  "bag-of-words": {
    maker: "Baseline",
    access: "No AI involved",
    size: "Nothing to download",
    about:
      "A baseline that only counts which words two sentences share. Anything scoring above it is doing more than matching words.",
  },
  "bge-large (mean)": {
    link: BGE_LARGE,
    maker: "BAAI",
    year: 2023,
    access: CLOUDFLARE,
    size: "670 MB download. MIT license",
    about: `${BGE_ABOUT} ${POOLING} Mean pooling averages them.`,
  },
  "bge-large": {
    link: BGE_LARGE,
    maker: "BAAI",
    year: 2023,
    access: `Open model. ${LAPTOP}`,
    size: "670 MB download. MIT license",
    about: `${BGE_ABOUT} ${POOLING} Cls pooling keeps one special summary token.`,
  },
  "bge-m3": {
    link: "https://huggingface.co/BAAI/bge-m3",
    maker: "BAAI",
    year: 2024,
    access: `Open model. ${LAPTOP}`,
    size: "1.2 GB download. MIT license",
    about:
      "Built for search in over 100 languages. Its makers recommend pairing it with a second re-ranking step, because a re-ranker is more accurate than embeddings alone.",
    possibleReason:
      "This test uses embeddings alone, without the second step its makers recommend.",
  },
  "all-minilm": {
    link: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2",
    maker: "sentence-transformers",
    access: `Open model. ${LAPTOP}`,
    size: "45 MB download. Apache 2.0 license",
    about:
      "A very small model for sentences and short paragraphs. It learned by picking a sentence's true partner out of random others, across a billion pairs from places like Reddit and WikiAnswers.",
    possibleReason:
      "Picking a partner from random sentences rarely forces a model to separate two nearly identical ones.",
  },
  "mxbai-embed-large": {
    link: "https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1",
    maker: "Mixedbread",
    year: 2024,
    access: `Open model. ${LAPTOP}`,
    size: "669 MB download. Apache 2.0 license",
    about:
      "An English model trained on hundreds of millions of pairs, then tuned on millions of high-quality triplets.",
    possibleReason:
      "Tuning on triplets is close in shape to this test, which also compares one sentence against two others.",
  },
  "nomic-embed-text": {
    link: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5",
    maker: "Nomic AI",
    access: `Open model. ${LAPTOP}`,
    size: "274 MB download. Apache 2.0 license",
    about:
      "Trained first on loosely related text, like questions and answers or titles and bodies. It requires a task prefix but has none for comparing sentences, so we used the closest match, its clustering prefix.",
    possibleReason:
      "Training on loosely related text may reward shared topic over exact meaning, and our prefix choice may also matter.",
  },
  embeddinggemma: {
    link: "https://huggingface.co/google/embeddinggemma-300m",
    maker: "Google DeepMind",
    year: 2025,
    access: `Open model. ${LAPTOP}`,
    size: "621 MB download. Gemma license",
    about:
      "A small model built to run on devices. It has a dedicated sentence-similarity mode, which we used, and its card warns it may miss subtle nuance.",
    possibleReason:
      "It's one of three models here with a documented mode for comparing sentences, and it's also one of the top scorers.",
  },
  "embeddinggemma-2": {
    link: "https://huggingface.co/google/embeddinggemma-2",
    maker: "Google DeepMind",
    year: 2026,
    access: `Open model. ${LAPTOP}`,
    size: "1.3 GB download. Apache 2.0 license",
    about:
      "The multimodal successor to EmbeddingGemma, covering text, images, video and audio. It has the same sentence-similarity mode, which we used, and the same warning about subtle nuance.",
    possibleReason:
      "It scored below the older text-only model. We can't say why, though covering more kinds of media is one difference.",
  },
  "qwen3-embedding:0.6b": {
    link: "https://huggingface.co/Qwen/Qwen3-Embedding-0.6B",
    maker: "Qwen",
    year: 2025,
    access: `Open model. ${LAPTOP}`,
    size: "639 MB download. Apache 2.0 license",
    about:
      "Built for search and ranking. It accepts an instruction on search queries, but its card gives none for comparing sentences, so we sent none.",
    possibleReason:
      "Its card says instructions improve results a little, and this test has none it could use.",
  },
  "openai/text-embedding-3-small": {
    link: "https://developers.openai.com/api/docs/guides/embeddings",
    maker: "OpenAI",
    year: 2024,
    access: PAID,
    size: "Hosted only, no download",
    about:
      "OpenAI's smaller embedding model, for search, clustering and classification. OpenAI doesn't publish how it was trained.",
  },
  "openai/text-embedding-3-large": {
    link: "https://developers.openai.com/api/docs/guides/embeddings",
    maker: "OpenAI",
    year: 2024,
    access: PAID,
    size: "Hosted only, no download",
    about:
      "OpenAI's most capable embedding model, with twice the output size of 3-small. OpenAI doesn't publish how it was trained.",
  },
  "sentence-transformers/all-mpnet-base-v2": {
    link: "https://huggingface.co/sentence-transformers/all-mpnet-base-v2",
    maker: "sentence-transformers",
    access: "Open model. We reached it through OpenRouter, which resells model APIs",
    size: "438 MB download. Apache 2.0 license",
    about:
      "The bigger sibling of all-MiniLM-L6-v2, trained the same way on the same billion pairs, with about five times the parameters.",
    possibleReason:
      "Same training as all-MiniLM, and about twice its score, so size seems to help here.",
  },
  "cohere/embed-5-pro": {
    link: "https://docs.cohere.com/docs/cohere-embed",
    maker: "Cohere",
    year: 2026,
    access: PAID,
    size: "Hosted only, no download",
    about:
      "Cohere's most capable model, aimed at retrieval quality. It has settings for search, classification and clustering, but none for comparing sentences, so we used clustering.",
    possibleReason:
      "It's built for search, where a matching topic is usually what you want, and our setting may also matter.",
  },
  "mongodb/voyage-4-large": {
    link: "https://docs.voyageai.com/docs/embeddings",
    maker: "Voyage AI",
    year: 2026,
    access: PAID,
    size: "Hosted only, no download",
    about:
      "Aimed at general-purpose search in many languages. We used no search settings, since those add retrieval prompts. It sometimes returned different results for identical requests.",
  },
  "google/gemini-embedding-2": {
    link: "https://aistudio.google.com/docs/embeddings",
    maker: "Google",
    year: 2026,
    access: PAID,
    size: "Hosted only, no download",
    about:
      "Covers text, images, video, audio and PDFs. Google documents a sentence-similarity mode that's meant for comparing meaning rather than search, and we used it.",
    possibleReason:
      "It has a mode made for exactly this comparison, and it scored highest.",
  },
};
