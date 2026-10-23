export type TranslationMode = "SIGN_TO_SPEECH" | "SPEECH_TO_TEXT";

export type TranslationResponseType =
  | "READY"
  | "ACK"
  | "PARTIAL"
  | "FINAL"
  | "FALLBACK"
  | "ERROR";

export interface TranslationError {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export interface TranslationResponse {
  type: TranslationResponseType;
  requestId?: string;
  success: boolean;
  data: Record<string, unknown> | null;
  error: TranslationError | null;
}
