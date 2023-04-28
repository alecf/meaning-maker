export interface SentenceInfo {
  sentence: string;
  distance: number;
}

export interface RichSentenceInfo extends SentenceInfo {
  /** Full content leading up to this sentence */
  content: string;
  embedding: number[];
}

export interface EmbedResponse {
  response: SentenceInfo[][];
}
