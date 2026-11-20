export const CAPTURE = { width: 640, height: 480, jpegQuality: 0.85 }

// Client limits; adjust after measuring against the real backend.
export const RECORDING_LIMITS = {
  maxDurationMs: 60_000,
  maxQueuedChunks: 30,
  resultTimeoutMs: 30_000,
}

export const TRANSPORT = {
  reconnectDelayMs: 2000,
  connectionTimeoutMs: 10_000,
  readyTimeoutMs: 15_000,
  ackTimeoutMs: 5000,
  maxAttempts: 3,
  webSocketChunkBytes: 16 * 1024,
  headerReserveBytes: 1024,
  maxRetainedBytes: 64 * 1024 * 1024,
}
