import { CAPTURE, RECORDING_LIMITS, TRANSPORT } from '../config/signRecording.ts'
import { DEFAULT_SIGN_POLICY } from '../types/signTranslation.ts'
import type { MediaPolicy, SignFrame, SignRequest, SignResult, SignTransport, VideoChunk } from '../types/signTranslation.ts'

export type RecordingProgress = {
  phase: 'connecting' | 'recording' | 'saving' | 'saved' | 'waiting' | 'error'
  requestId: string
  frames: number
  chunks: number
  message: string
}

type Options = {
  video: HTMLVideoElement
  save?: (message: SignRequest) => Promise<void>
  transport?: SignTransport
  onResult?: (result: SignResult) => void
  mockResult?: SignResult
  limits?: Partial<typeof RECORDING_LIMITS>
  onProgress: (progress: RecordingProgress) => void
}

/** One sentence. The preview's CSS mirror is deliberately not applied to captured pixels. */
export class SignRecordingSession {
  readonly requestId = crypto.randomUUID()
  private options: Options
  private policy: MediaPolicy = DEFAULT_SIGN_POLICY
  private frames: SignFrame[] = []
  private frameIndex = 0
  private sequence = 0
  private persisted = 0
  private timer?: ReturnType<typeof setTimeout>
  private queue: Promise<void> = Promise.resolve()
  private queuedChunks = 0
  private disposed = false
  private stopPromise?: Promise<void>
  private canvas: HTMLCanvasElement
  private currentPhase: RecordingProgress['phase'] | 'idle' = 'idle'
  private finalResult?: SignResult
  private durationTimer?: ReturnType<typeof setTimeout>
  private resultTimer?: ReturnType<typeof setTimeout>
  private limits: typeof RECORDING_LIMITS

  get phase() { return this.currentPhase }
  get busy() { return ['connecting', 'saving', 'waiting'].includes(this.phase) }
  private get terminal() { return this.disposed || this.phase === 'error' || this.phase === 'saved' }
  private get recording() { return this.phase === 'recording' }

  constructor(options: Options) {
    this.options = options
    this.limits = { ...RECORDING_LIMITS, ...options.limits }
    this.canvas = document.createElement('canvas')
    this.canvas.width = CAPTURE.width
    this.canvas.height = CAPTURE.height
  }

  private report(phase: RecordingProgress['phase'], message: string) {
    if (this.terminal) return
    this.currentPhase = phase
    this.options.onProgress({
      phase, message, requestId: this.requestId, frames: this.frameIndex, chunks: this.persisted,
    })
  }

  private halt() {
    clearTimeout(this.timer)
    clearTimeout(this.durationTimer)
  }

  private release() {
    this.halt()
    clearTimeout(this.resultTimer)
    this.frames = []
    this.options.transport?.close()
  }

  fail(error: unknown) {
    if (this.terminal) return
    this.report('error', error instanceof Error ? error.message : '수어 녹화 중 오류가 발생했습니다.')
    this.release()
  }

  acceptResult(result: SignResult) {
    if (this.terminal || this.finalResult) return
    if (result.type === 'PARTIAL') {
      this.options.onResult?.(result)
      return
    }
    this.finalResult = result
    // A final result can arrive just before the COMMIT ACK.
    if (this.phase === 'waiting') this.completeResult()
  }

  private completeResult() {
    if (!this.finalResult || this.terminal) return
    this.report('saved', this.finalResult.type === 'FINAL'
      ? (this.options.mockResult && !this.options.transport ? '테스트용 번역 완료' : '번역 완료')
      : this.finalResult.text)
    this.release()
    // Deliver a final result once, only after recording and COMMIT have finished.
    this.options.onResult?.(this.finalResult)
  }

  async start() {
    if (this.phase !== 'idle' || this.disposed) return
    this.report('connecting', this.options.transport ? '번역 서버 연결 중' : '녹화 준비 중')
    try {
      if (!this.options.save && !this.options.transport) throw new Error('번역 서버 또는 테스트 전송기를 설정해 주세요.')
      if (this.options.transport) this.policy = await this.options.transport.connect()
      if (this.terminal) return
      this.report('recording', this.options.transport
        ? '수어 녹화 및 서버 전송 중입니다. 중지하면 번역을 요청합니다.'
        : '테스트 녹화 중입니다. 다시 누르면 종료합니다.')
      this.durationTimer = setTimeout(() => { void this.stop() }, this.limits.maxDurationMs)
      this.capture()
    } catch (error) {
      this.fail(error)
    }
  }

  private capture = () => {
    if (!this.recording || this.disposed) return
    const startedAt = performance.now()
    try {
      const { video } = this.options
      const media = video.srcObject as MediaStream | null
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight
        || media?.getVideoTracks().some((track) => track.readyState === 'ended')) {
        throw new Error('카메라 영상이 중단되어 녹화를 종료했습니다. 연결을 확인해 주세요.')
      }
      if (document.visibilityState === 'hidden') throw new Error('탭이 숨겨져 녹화를 중단했습니다. 탭을 열고 다시 녹화해 주세요.')
      const context = this.canvas.getContext('2d')
      if (!context) throw new Error('이 브라우저에서 영상 캡처를 지원하지 않습니다.')
      const scale = Math.min(CAPTURE.width / video.videoWidth, CAPTURE.height / video.videoHeight)
      const width = video.videoWidth * scale
      const height = video.videoHeight * scale
      context.fillStyle = '#000'
      context.fillRect(0, 0, CAPTURE.width, CAPTURE.height)
      context.drawImage(video, (CAPTURE.width - width) / 2, (CAPTURE.height - height) / 2, width, height)
      // Reserve room for STOMP, JSON metadata and per-frame timestamps/indexes.
      const frameBudget = Math.floor((this.policy.maxMessageBytes - TRANSPORT.headerReserveBytes - 1024)
        / this.policy.videoFramesPerChunk) - 128
      let contentBase64 = ''
      for (const quality of [CAPTURE.jpegQuality, 0.7, 0.5, 0.3, 0.1]) {
        const dataUrl = this.canvas.toDataURL('image/jpeg', quality)
        if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('JPEG 인코딩을 지원하지 않습니다.')
        contentBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
        if (contentBase64.length > 0 && contentBase64.length <= frameBudget) break
      }
      if (!contentBase64 || contentBase64.length > frameBudget) {
        throw new Error('서버 메시지 제한에 맞는 JPEG를 만들 수 없습니다. 서버 전송 정책을 확인해 주세요.')
      }
      this.frames.push({
        frameIndex: ++this.frameIndex,
        capturedAt: new Date().toISOString(),
        contentBase64,
      })
      if (this.frames.length >= this.policy.videoFramesPerChunk) this.flush()
      // Do not generate catch-up bursts when a slow device misses its capture deadline.
      if (this.recording) this.timer = setTimeout(this.capture, Math.max(0, 1000 / this.policy.videoFps - (performance.now() - startedAt)))
    } catch (error) {
      this.fail(error)
    }
  }

  private flush() {
    if (!this.frames.length) return
    const message: VideoChunk = {
      type: 'VIDEO_CHUNK',
      requestId: this.requestId,
      sequence: ++this.sequence,
      timestamp: new Date().toISOString(),
      input: {
        encoding: 'JPEG', width: CAPTURE.width, height: CAPTURE.height, fps: this.policy.videoFps,
        frames: this.frames, nonManualFeaturesEnabled: true,
      },
    }
    this.frames = []
    this.queuedChunks++
    this.queue = this.queue.then(async () => {
      try {
        if (this.terminal) return
        await this.options.save?.(message)
        if (this.terminal) return
        await this.options.transport?.send(message)
        if (this.terminal) return
        this.persisted++
        if (this.recording) this.report('recording', this.options.transport
          ? '수어 녹화 및 서버 전송 중입니다. 중지하면 번역을 요청합니다.'
          : '테스트 녹화 중입니다. 다시 누르면 종료합니다.')
      } catch (error) {
        this.fail(error)
      } finally {
        this.queuedChunks--
      }
    })
    if (this.queuedChunks > this.limits.maxQueuedChunks && !this.terminal) this.fail(new Error('저장 또는 전송이 지연되어 녹화를 중단했습니다. 연결 상태를 확인해 주세요.'))
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    if (!this.recording || this.terminal) return Promise.resolve()
    this.halt()
    this.flush()
    this.report('saving', this.options.transport ? '남은 프레임을 서버로 전송하고 있습니다.' : '남은 프레임을 저장하고 있습니다.')
    this.stopPromise = this.finish()
    return this.stopPromise
  }

  private async finish() {
    await this.queue
    if (this.terminal) return
    if (!this.sequence) {
      this.fail(new Error('저장할 영상 프레임이 없습니다.'))
      return
    }
    const message: SignRequest = {
      type: 'COMMIT', requestId: this.requestId, timestamp: new Date().toISOString(),
      input: { lastSequence: this.sequence, reason: 'USER_FINISHED' },
    }
    try {
      await this.options.save?.(message)
      if (this.terminal) return
      await this.options.transport?.send(message)
      if (this.terminal) return
      if (!this.options.transport) {
        if (this.options.mockResult) {
          this.report('waiting', '테스트용 번역 결과 대기 중')
          this.acceptResult(this.options.mockResult)
        } else {
          this.report('saved', '전송 완료')
          this.release()
        }
      } else {
        this.report('waiting', '전송 완료 · 번역 결과 대기 중')
        if (this.finalResult) this.completeResult()
        else this.resultTimer = setTimeout(() => {
          this.fail(new Error('최종 결과 대기 시간이 초과되었습니다. 다시 녹화해 주세요.'))
        }, this.limits.resultTimeoutMs)
      }
    } catch (error) {
      this.fail(error)
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.release()
  }
}
