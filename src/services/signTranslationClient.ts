import type { Client } from '@stomp/stompjs'
import { createTranslationClient } from '../apis/websocket/stompClient.ts'
import type { MediaPolicy, SignRequest, SignResult, SignTransport, VideoChunk } from '../types/signTranslation.ts'

import { TRANSPORT } from '../config/signRecording.ts'
import { parseServerResponse } from './signServerResponse.ts'
import type { ServerError, ServerResponse } from './signServerResponse.ts'

class TranslationError extends Error {
  readonly details: ServerError
  constructor(details: ServerError) {
    super(details.message)
    this.details = details
  }
}

export class SignTranslationClient implements SignTransport {
  private client: Client
  private ready = false
  private disposed = false
  private policy?: MediaPolicy
  private requestId?: string
  private lastProcessed = 0
  private finalized = false
  private chunks = new Map<number, VideoChunk>()
  private retainedBytes = 0
  private onError: (error: Error) => void
  private onResult: (result: SignResult) => void
  private readyWaiter?: { resolve: (policy: MediaPolicy) => void; reject: (error: Error) => void }
  private pending?: {
    message: SignRequest
    resolve: () => void
    reject: (error: Error) => void
    retry: () => void
  }

  constructor(url: string, onResult: (result: SignResult) => void, onError: (error: Error) => void = () => {}) {
    this.onResult = onResult
    this.onError = onError
    this.client = createTranslationClient({
      url, mode: 'SIGN_TO_SPEECH',
      onConnect: () => { this.ready = false },
      onMessage: value => this.receive(parseServerResponse(value)),
      onError: error => this.fail(error),
      onClose: () => { this.ready = false },
    })
  }

  connect(): Promise<MediaPolicy> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error('서버 READY 응답이 없습니다. 주소와 허용 Origin을 확인해 주세요.'))
        this.close()
      }, TRANSPORT.readyTimeoutMs)
      this.readyWaiter = {
        resolve: (policy) => { clearTimeout(timer); this.readyWaiter = undefined; resolve(policy) },
        reject: (error) => { clearTimeout(timer); this.readyWaiter = undefined; reject(error) },
      }
      this.client.activate()
    })
  }

  private fail(error: Error) {
    if (this.disposed) return
    if (this.readyWaiter) this.readyWaiter.reject(error)
    else if (this.pending) this.pending.reject(error)
    else {
      this.close()
      this.onError(error)
    }
  }

  private receive(response: ServerResponse) {
    if (this.disposed) return
    if (response.type === 'READY') {
      const policy = response.data.mediaPolicy
      if (this.policy && JSON.stringify(this.policy) !== JSON.stringify(policy)) {
        this.fail(new Error('재연결 후 전송 정책이 변경되었습니다. 새 녹화를 시작해 주세요.'))
        return
      }
      this.policy = policy
      this.ready = true
      this.readyWaiter?.resolve(policy)
      // ACK를 받지 못한 동일 청크만 재전송한다.
      this.pending?.retry()
      return
    }
    if (response.requestId && response.requestId !== this.requestId) return
    if (response.type === 'ERROR') {
      this.fail(new TranslationError(response.error))
      return
    }
    if (response.type === 'ACK' && this.pending) {
      const message = this.pending.message
      const sequence = message.type === 'VIDEO_CHUNK' ? message.sequence : message.input.lastSequence
      const status = message.type === 'VIDEO_CHUNK' ? 'RECEIVING' : 'PROCESSING'
      if (response.data.status === status && response.data.acknowledgedSequence === sequence) this.pending.resolve()
    }
    if (this.finalized) return
    if (response.type === 'PARTIAL') {
      if (response.data.processedSequence >= this.lastProcessed) {
        this.lastProcessed = response.data.processedSequence
        this.onResult({ type: 'PARTIAL', text: response.data.result.partialText })
      }
    } else if (response.type === 'FINAL' || response.type === 'FALLBACK') {
      this.finalized = true
      this.chunks.clear()
      this.retainedBytes = 0
      this.onResult({ type: response.type, text: response.type === 'FINAL' ? response.data.result.text : response.data.result.message })
    }
  }

  private sendAndWait(message: SignRequest): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('번역 연결이 종료되었습니다.'))
    if (this.pending) return Promise.reject(new Error('이전 요청 ACK를 기다리는 중입니다.'))
    const body = JSON.stringify(message)
    // STOMP 헤더 공간을 확보한다. WebSocket 조각 분할로 전체 제한을 우회하지 않는다.
    if (new TextEncoder().encode(body).length + TRANSPORT.headerReserveBytes > (this.policy?.maxMessageBytes ?? 0)) {
      return Promise.reject(new Error('영상 묶음이 서버 메시지 크기 제한을 초과했습니다.'))
    }
    return new Promise((resolve, reject) => {
      let attempts = 0
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (error?: Error) => {
        clearTimeout(timer)
        this.pending = undefined
        if (error) reject(error)
        else resolve()
      }
      const retry = () => {
        clearTimeout(timer)
        if (++attempts > TRANSPORT.maxAttempts) {
          finish(new Error('서버 ACK 대기 시간이 초과되었습니다. 연결 상태를 확인하고 다시 녹화해 주세요.'))
          return
        }
        if (this.ready && this.client.connected) {
          try {
            this.client.publish({ destination: '/app/translations', headers: { 'content-type': 'application/json' }, body })
          } catch (error) {
            finish(error instanceof Error ? error : new Error('전송 실패'))
            return
          }
        }
        timer = setTimeout(() => {
          // COMMIT의 결과 복구/멱등성은 미확정: ACK 유실 시 자동 중복 확정하지 않는다.
          if (message.type === 'COMMIT') finish(new Error('COMMIT 응답을 확인하지 못했습니다. 서버 처리 상태를 확인해 주세요.'))
          else retry()
        }, TRANSPORT.ackTimeoutMs)
      }
      this.pending = { message, resolve: () => finish(), reject: (error) => finish(error), retry: () => {
        if (message.type === 'VIDEO_CHUNK') retry()
      } }
      retry()
    })
  }

  async send(message: SignRequest) {
    this.requestId = message.requestId
    if (message.type === 'VIDEO_CHUNK' && !this.chunks.has(message.sequence)) {
      // Conservative UTF-16 payload budget. Keep ACKed chunks for SEQUENCE_GAP recovery.
      const bytes = JSON.stringify(message).length * 2
      if (this.retainedBytes + bytes > TRANSPORT.maxRetainedBytes) throw new Error('녹화 데이터 용량 제한에 도달했습니다. 더 짧게 나누어 녹화해 주세요.')
      this.chunks.set(message.sequence, message)
      this.retainedBytes += bytes
    }
    try {
      await this.sendAndWait(message)
    } catch (error) {
      if (message.type !== 'COMMIT' || !(error instanceof TranslationError) || error.details?.code !== 'SEQUENCE_GAP') throw error
      const missing = error.details.details?.missingSequences
      if (!missing?.length) throw error
      for (const sequence of missing) {
        const chunk = this.chunks.get(sequence)
        if (!chunk) throw error
        await this.sendAndWait(chunk)
      }
      await this.sendAndWait(message)
    }
  }

  close() {
    if (this.disposed) return
    this.disposed = true
    const error = new Error('번역 연결이 종료되었습니다.')
    this.readyWaiter?.reject(error)
    this.pending?.reject(error)
    this.chunks.clear()
    this.retainedBytes = 0
    void this.client.deactivate()
  }
}
