import type { MediaPolicy } from '../types/signTranslation.ts'

export type ServerError = {
  code: string
  message: string
  retryable?: boolean
  details?: { missingSequences?: number[] }
}

export type ServerResponse =
  | { type: 'READY'; success: true; data: { mode: 'SIGN_TO_SPEECH'; mediaPolicy: MediaPolicy } }
  | { type: 'ACK'; success: true; requestId: string; data: { status: 'RECEIVING' | 'PROCESSING'; acknowledgedSequence: number } }
  | { type: 'PARTIAL'; success: true; requestId: string; data: { processedSequence: number; result: { partialText: string } } }
  | { type: 'FINAL'; success: true; requestId: string; data: { result: { text: string } } }
  | { type: 'FALLBACK'; success: true; requestId: string; data: { result: { message: string } } }
  | { type: 'ERROR'; success: false; requestId?: string; error: ServerError }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('서버 응답 객체가 올바르지 않습니다.')
  return value as Record<string, unknown>
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('서버 응답 문자열이 올바르지 않습니다.')
  return value
}

function integer(value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error('서버 응답 숫자가 올바르지 않습니다.')
  }
  return value
}

export function parseServerResponse(value: unknown): ServerResponse {
  const response = object(value)
  if (response.type === 'ERROR') {
    if (response.success !== false) throw new Error('서버 오류 응답이 올바르지 않습니다.')
    const error = object(response.error)
    const details = error.details === undefined ? undefined : object(error.details)
    let missingSequences: number[] | undefined
    if (details?.missingSequences !== undefined) {
      if (!Array.isArray(details.missingSequences) || details.missingSequences.length > 20) throw new Error('누락 묶음 목록이 올바르지 않습니다.')
      missingSequences = details.missingSequences.map((sequence) => integer(sequence))
    }
    if (error.retryable !== undefined && typeof error.retryable !== 'boolean') throw new Error('재시도 응답이 올바르지 않습니다.')
    return {
      type: 'ERROR', success: false,
      requestId: response.requestId === undefined ? undefined : string(response.requestId),
      error: { code: string(error.code), message: string(error.message), retryable: error.retryable,
        details: missingSequences ? { missingSequences } : undefined },
    }
  }
  if (response.success !== true) throw new Error('서버 응답의 성공 여부가 올바르지 않습니다.')
  const data = object(response.data)
  if (response.type === 'READY') {
    if (data.mode !== 'SIGN_TO_SPEECH') throw new Error('서버의 번역 모드가 올바르지 않습니다.')
    const policy = object(data.mediaPolicy)
    const mediaPolicy = {
      videoFps: integer(policy.videoFps, 1, 120),
      videoFramesPerChunk: integer(policy.videoFramesPerChunk, 1, 60),
      videoChunkIntervalMs: integer(policy.videoChunkIntervalMs),
      maxMessageBytes: integer(policy.maxMessageBytes, 4096),
    }
    if (Math.abs(mediaPolicy.videoFramesPerChunk * 1000 / mediaPolicy.videoFps - mediaPolicy.videoChunkIntervalMs) > 2) {
      throw new Error('서버의 영상 전송 간격이 FPS 및 묶음 크기와 맞지 않습니다.')
    }
    return { type: 'READY', success: true, data: { mode: 'SIGN_TO_SPEECH', mediaPolicy } }
  }
  const requestId = string(response.requestId)
  if (!requestId) throw new Error('서버 응답의 requestId가 비어 있습니다.')
  if (response.type === 'ACK') {
    if (data.status !== 'RECEIVING' && data.status !== 'PROCESSING') throw new Error('ACK 상태가 올바르지 않습니다.')
    return { type: 'ACK', success: true, requestId, data: { status: data.status, acknowledgedSequence: integer(data.acknowledgedSequence) } }
  }
  const result = object(data.result)
  switch (response.type) {
    case 'PARTIAL': return { type: 'PARTIAL', success: true, requestId,
      data: { processedSequence: integer(data.processedSequence, 0), result: { partialText: string(result.partialText) } } }
    case 'FINAL': return { type: 'FINAL', success: true, requestId, data: { result: { text: string(result.text) } } }
    case 'FALLBACK': return { type: 'FALLBACK', success: true, requestId,
      data: { result: { message: result.message === undefined ? '다시 수어를 입력해 주세요.' : string(result.message) } } }
    default: throw new Error('지원하지 않는 서버 응답입니다.')
  }
}
