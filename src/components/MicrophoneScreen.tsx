import { useEffect, useRef, useState } from 'react'
import styled from '@emotion/styled'

export type MicrophoneStatus = 'requesting' | 'ready' | 'muted' | 'error'

type MicrophoneScreenProps = {
  onStatusChange: (status: MicrophoneStatus) => void
}

function microphoneErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return '마이크 접근이 차단되었습니다. 브라우저 사이트 설정에서 마이크를 허용한 뒤 다시 시도해 주세요.'
      case 'NotFoundError':
        return '연결된 마이크가 없습니다. 기기의 마이크 연결을 확인해 주세요.'
      case 'NotReadableError':
      case 'AbortError':
        return '마이크를 사용할 수 없습니다. 다른 앱에서 사용 중인지 확인한 뒤 다시 시도해 주세요.'
    }
  }
  return '마이크에 연결할 수 없습니다. 기기 연결과 브라우저 설정을 확인해 주세요.'
}

export default function MicrophoneScreen({ onStatusChange }: MicrophoneScreenProps) {
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<MicrophoneStatus>('requesting')
  const [errorMessage, setErrorMessage] = useState('')
  const [needsResume, setNeedsResume] = useState(false)
  const waveformRef = useRef<SVGSVGElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    let disposed = false
    let stream: MediaStream | undefined
    let context: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let analyser: AnalyserNode | undefined
    let animationFrame = 0
    const bars = Array.from(waveformRef.current?.querySelectorAll('line') ?? [])

    const report = (next: MicrophoneStatus) => {
      if (disposed) return
      setStatus(next)
      onStatusChange(next)
    }

    const release = () => {
      cancelAnimationFrame(animationFrame)
      source?.disconnect()
      analyser?.disconnect()
      if (context) {
        context.onstatechange = null
        if (context.state !== 'closed') void context.close().catch(() => {})
      }
      if (audioContextRef.current === context) audioContextRef.current = null
      bars.forEach((bar) => {
        bar.setAttribute('y1', '76')
        bar.setAttribute('y2', '84')
      })
      stream?.getTracks().forEach((track) => {
        track.onended = null
        track.onmute = null
        track.onunmute = null
        track.stop()
      })
    }

    const fail = (message: string) => {
      if (disposed) return
      release()
      setErrorMessage(message)
      setNeedsResume(false)
      report('error')
    }

    const connect = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('unsupported')
      }
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      })
      // A permission request can finish after switching modes or unmounting.
      if (disposed) {
        acquired.getTracks().forEach((track) => track.stop())
        return
      }
      stream = acquired
      const track = stream.getAudioTracks()[0]
      if (!track || track.readyState === 'ended') {
        fail('마이크 연결이 끊겼습니다. 기기 연결을 확인하고 다시 시도해 주세요.')
        return
      }
      track.onended = () => fail('마이크 연결이 끊겼습니다. 기기 연결을 확인하고 다시 시도해 주세요.')
      track.onmute = () => report('muted')
      track.onunmute = () => report('ready')
      context = new AudioContext()
      audioContextRef.current = context
      source = context.createMediaStreamSource(stream)
      analyser = context.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      // Analyse the microphone without connecting it to speakers (no feedback).
      const samples = new Float32Array(analyser.fftSize)
      const heights = bars.map(() => 8)
      const profile = [0.15, 0.4, 0.65, 0.5, 0.75, 0.95, 1, 0.9, 0.75, 0.55, 0.35, 0.15]
      const draw = () => {
        if (disposed || !analyser || !context) return
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += sample * sample
        const rms = Math.sqrt(sum / samples.length)
        const level = track.muted || context.state !== 'running'
          ? 0 : Math.min(1, Math.max(0, rms - 0.006) * 12)
        bars.forEach((bar, index) => {
          const target = 8 + level * 136 * profile[index]
          heights[index] += (target - heights[index]) * (target > heights[index] ? 0.45 : 0.15)
          bar.setAttribute('y1', String((160 - heights[index]) / 2))
          bar.setAttribute('y2', String((160 + heights[index]) / 2))
        })
        animationFrame = requestAnimationFrame(draw)
      }
      context.onstatechange = () => {
        if (!disposed && context) setNeedsResume(context.state === 'suspended')
      }
      setNeedsResume(context.state === 'suspended')
      void context.resume().catch(() => {
        if (!disposed) setNeedsResume(true)
      })
      draw()
      report(track.muted ? 'muted' : 'ready')
    }

    void connect().catch((error: unknown) => {
      fail(error instanceof Error && error.message === 'unsupported'
        ? '마이크를 지원하는 브라우저에서 접속해 주세요.'
        : microphoneErrorMessage(error))
    })

    return () => {
      disposed = true
      release()
    }
  }, [attempt, onStatusChange])

  const message = status === 'ready'
    ? '마이크가 연결되었습니다.'
    : status === 'muted'
      ? '마이크 입력이 일시 중단되었습니다. 기기 상태를 확인해 주세요.'
      : status === 'error'
        ? errorMessage
        : '마이크 연결 중입니다. 권한 요청이 표시되면 허용해 주세요.'

  return (
    <Screen>
      <VoiceVisual aria-hidden="true">
        <svg ref={waveformRef} viewBox="0 0 220 160" fill="none">
          {Array.from({ length: 12 }, (_, index) => (
            <line key={index} x1={8 + index * 18.5} x2={8 + index * 18.5}
              y1={76} y2={84}
              stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          ))}
        </svg>
      </VoiceVisual>
      <Guidance>{status === 'ready'
        ? '듣고 있어요! 기기에 대고 말씀하시면 텍스트로 바꿔드릴게요.'
        : '음성으로 말하기를 위해 마이크 연결을 확인해 주세요.'}</Guidance>
      <ConnectionStatus role="status" aria-live="polite">{status === 'ready' ? '' : message}</ConnectionStatus>
      {needsResume && status !== 'error' && (
        <RetryButton type="button" onClick={() => {
          void audioContextRef.current?.resume().catch(() => setNeedsResume(true))
        }}>음성 파형 활성화</RetryButton>
      )}
      {status === 'error' && (
        <RetryButton type="button" onClick={() => {
          setStatus('requesting')
          onStatusChange('requesting')
          setAttempt((value) => value + 1)
        }}>
          다시 시도
        </RetryButton>
      )}
    </Screen>
  )
}

const Screen = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 96px 24px 24px;
  background: #fff;
  color: #21406a;
  text-align: center;
  overflow: hidden;
`

const VoiceVisual = styled.div`
  position: relative;
  width: clamp(140px, 11.5vw, 220px);
  flex-shrink: 0;
  svg { display: block; width: 100%; height: auto; }

`

const Guidance = styled.div`
  margin-top: 28px;
  color: #9ca3af;
  font-size: clamp(12px, 0.85vw, 16px);
`

const ConnectionStatus = styled.div`
  min-height: 24px;
  margin-top: 12px;
  max-width: 560px;
  color: #64748b;
  font-size: 14px;
`

const RetryButton = styled.button`
  border: 1px solid #fff;
  border-radius: 8px;
  padding: 8px 20px;
  background: #21406a;
  color: #fff;
  cursor: pointer;
`
