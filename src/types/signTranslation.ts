export type MediaPolicy = {
  videoFps: number
  videoFramesPerChunk: number
  videoChunkIntervalMs: number
  maxMessageBytes: number
}

export const DEFAULT_SIGN_POLICY: MediaPolicy = {
  videoFps: 15,
  videoFramesPerChunk: 3,
  videoChunkIntervalMs: 200,
  maxMessageBytes: 8 * 1024 * 1024,
}

export type SignFrame = {
  frameIndex: number
  capturedAt: string
  contentBase64: string
}

export type VideoChunk = {
  type: 'VIDEO_CHUNK'
  requestId: string
  sequence: number
  timestamp: string
  input: {
    encoding: 'JPEG'
    width: number
    height: number
    fps: number
    frames: SignFrame[]
    nonManualFeaturesEnabled: boolean
  }
}

export type SignCommit = {
  type: 'COMMIT'
  requestId: string
  timestamp: string
  input: { lastSequence: number; reason: 'USER_FINISHED' }
}

export type SignRequest = VideoChunk | SignCommit

export type SignResult = {
  type: 'PARTIAL' | 'FINAL' | 'FALLBACK'
  text: string
}

export interface SignTransport {
  connect(): Promise<MediaPolicy>
  send(message: SignRequest): Promise<void>
  close(): void
}
