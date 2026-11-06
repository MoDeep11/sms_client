import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { SignRecordingSession } from '@/services/signRecordingSession'
import type { RecordingProgress } from '@/services/signRecordingSession'
import { SignTranslationClient } from '@/services/signTranslationClient'
import { MOCK_SIGN_RESULT } from '@/mocks/signTranslation'

export function useSignRecording(videoRef: RefObject<HTMLVideoElement | null>, onFinal?: (text: string) => void) {
  const [progress, setProgress] = useState<RecordingProgress | null>(null)
  const [result, setResult] = useState('')
  const [finalText, setFinalText] = useState('')
  const sessionRef = useRef<SignRecordingSession | null>(null)
  const serverUrl = import.meta.env.VITE_TRANSLATION_WS_URL?.trim()
  const isMock = import.meta.env.DEV && import.meta.env.VITE_TRANSLATION_USE_MOCK === 'true'

  useEffect(() => () => {
    const session = sessionRef.current
    sessionRef.current = null
    session?.dispose()
  }, [])

  const cancel = () => {
    const session = sessionRef.current
    sessionRef.current = null
    session?.dispose()
    setProgress(null)
    setResult('')
    setFinalText('')
  }

  const toggle = async () => {
    const current = sessionRef.current
    if (current?.phase === 'recording') {
      await current.stop()
      return
    }
    if (current?.busy) return
    const video = videoRef.current
    if (!video) return
    cancel()
    try {
      if (!isMock && !serverUrl) {
        throw new Error('.env에 VITE_TRANSLATION_WS_URL을 설정하고 개발 서버를 다시 시작해 주세요.')
      }
      const transport = !isMock && serverUrl ? new SignTranslationClient(serverUrl,
        (response) => session.acceptResult(response),
        (error) => session.fail(error),
      ) : undefined
      const session = new SignRecordingSession({
        video,
        // MOCK validates the capture flow without writing images to disk.
        save: isMock ? async () => {} : undefined,
        mockResult: isMock ? MOCK_SIGN_RESULT : undefined,
        transport,
        onResult: (response) => {
          if (sessionRef.current !== session) return
          setResult(response.text)
          if (response.type === 'FINAL') {
            setFinalText(response.text)
            onFinal?.(response.text)
          }
        },
        onProgress: (next) => {
          if (sessionRef.current === session) setProgress(next)
        },
      })
      sessionRef.current = session
      await session.start()
    } catch (error) {
      sessionRef.current?.dispose()
      sessionRef.current = null
      setProgress({ phase: 'error', requestId: '', frames: 0, chunks: 0,
        message: error instanceof Error ? error.message : '녹화를 시작할 수 없습니다.' })
    }
  }

  const recording = progress?.phase === 'recording'
  const busy = progress?.phase === 'connecting' || progress?.phase === 'saving' || progress?.phase === 'waiting'
  return { recording, busy, progress, result, finalText, isMock, toggle, cancel }
}
