export type TranslationMode = "SIGN_TO_SPEECH" | "SPEECH_TO_TEXT";

export type TranslationStatus =
  | "RECEIVING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface TranslationError {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export interface MediaPolicy {
  videoFps: number;
  videoFramesPerChunk: number;
  videoChunkIntervalMs: number;
  audioChunkIntervalMs: number;
  maxMessageBytes: number;
}

export interface ReadyData {
  connectionId: string;
  mode: TranslationMode;
  mediaPolicy: MediaPolicy;
}

export interface AckData {
  status: TranslationStatus;
  acknowledgedSequence: number;
  lastStoredSequence: number;
  nextExpectedSequence: number;
  duplicate: boolean;
}

export interface PartialData {
  mode: TranslationMode;
  status: TranslationStatus;
  processedSequence: number;
  result: { partialText: string; confidence: number; isFinal: boolean };
}

export interface SpeechFinalData {
  mode: "SPEECH_TO_TEXT";
  status: TranslationStatus;
  result: { text: string; confidence: number };
  processingLatencyMs: number;
}

export interface FallbackData {
  mode: TranslationMode;
  status: TranslationStatus;
  result: {
    observedConfidence: number;
    reason: string;
    threshold: number;
    message: string;
    retryable: boolean;
  };
}

export type TranslationResponse =
  | { type: "READY"; success: true; data: ReadyData; error: null }
  | {
      type: "ACK";
      requestId: string;
      success: true;
      data: AckData;
      error: null;
    }
  | {
      type: "PARTIAL";
      requestId: string;
      success: true;
      data: PartialData;
      error: null;
    }
  | {
      type: "FINAL";
      requestId: string;
      success: true;
      data: SpeechFinalData;
      error: null;
    }
  | {
      type: "FALLBACK";
      requestId: string;
      success: true;
      data: FallbackData;
      error: null;
    }
  | {
      type: "ERROR";
      requestId?: string;
      success: false;
      data: null;
      error: TranslationError;
    };

export type TranslationResponseType = TranslationResponse["type"];

export type AudioEncoding = "WEBM_OPUS" | "OPUS" | "PCM_S16LE";

export interface AudioChunkInput {
  capturedAt: string;
  encoding: AudioEncoding;
  sampleRateHz: number;
  channels: number;
  durationMs: number;
  contentBase64: string;
  locale?: string;
  domainContext?: string;
}

export interface AudioChunkRequest {
  type: "AUDIO_CHUNK";
  requestId: string;
  sequence: number;
  timestamp: string;
  input: AudioChunkInput;
}

export interface CommitRequest {
  type: "COMMIT";
  requestId: string;
  timestamp: string;
  input: { lastSequence: number; reason: "USER_FINISHED" };
}
