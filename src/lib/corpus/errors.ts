export type CorpusErrorCode =
  | "INVALID_INPUT"
  | "SOURCE_NOT_APPROVED"
  | "REDIRECT_NOT_APPROVED"
  | "SSRF_BLOCKED"
  | "FETCH_TIMEOUT"
  | "FETCH_FAILED"
  | "CONTENT_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "UNSAFE_URL"
  | "PDF_PARSE_FAILED"
  | "NO_TEXT_EXTRACTED"
  | "EMBEDDING_FAILED"
  | "TAGGING_FAILED"
  | "CLAIM_EXTRACTION_FAILED"
  | "SEARCH_PROVIDER_FAILED"
  | "RETRIEVAL_FAILED"
  | "RERANK_FAILED"
  | "GEMINI_FAILED"
  | "REQUEST_TIMEOUT"
  | "DATABASE_FAILED";

export class CorpusError extends Error {
  constructor(
    public readonly code: CorpusErrorCode,
    message: string,
    public readonly status = 500,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CorpusError";
  }
}

export function safeError(error: unknown): {
  code: CorpusErrorCode;
  message: string;
  status: number;
} {
  if (error instanceof CorpusError) {
    return { code: error.code, message: error.message, status: error.status };
  }

  return {
    code: "DATABASE_FAILED",
    message: error instanceof Error ? error.message : "Unexpected corpus error.",
    status: 500,
  };
}
