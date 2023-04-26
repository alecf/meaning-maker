export interface SentenceInfo {
  sentence: string;
  distance: number;
}

export interface RichSentenceInfo extends SentenceInfo {
  /** Full content leading up to this sentence */
  content: string;
}

export interface EmbedResponse {
  response: SentenceInfo[];
}
