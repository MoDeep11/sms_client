import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechState = { phase: 'idle' | 'starting' | 'speaking' | 'error'; message: string }

export function useTextToSpeech() {
  const supported = typeof window !== 'undefined'
    && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  const [state, setState] = useState<SpeechState>({ phase: 'idle', message: '' })
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const startTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const release = useCallback(() => {
    clearTimeout(startTimer.current)
    const utterance = utteranceRef.current
    utteranceRef.current = null
    if (!utterance) return
    utterance.onstart = null
    utterance.onend = null
    utterance.onerror = null
    window.speechSynthesis.cancel()
  }, [])

  useEffect(() => release, [release])

  const stop = useCallback(() => {
    release()
    setState({ phase: 'idle', message: '음성 재생을 중지했습니다.' })
  }, [release])

  const speak = useCallback((text: string) => {
    release()
    if (!supported) {
      setState({ phase: 'error', message: '이 브라우저는 음성 읽기를 지원하지 않습니다.' })
      return
    }
    if (!text.trim()) {
      setState({ phase: 'idle', message: '' })
      return
    }
    const utterance = new SpeechSynthesisUtterance(text.trim())
    utterance.lang = 'ko-KR'
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    // Voices can load lazily. Re-read on every playback; lang is the fallback.
    const voice = window.speechSynthesis.getVoices().find((item) => /^ko(?:[-_]|$)/i.test(item.lang))
    if (voice) utterance.voice = voice
    utteranceRef.current = utterance
    setState({ phase: 'starting', message: '음성 재생을 준비하고 있습니다.' })
    utterance.onstart = () => {
      if (utteranceRef.current !== utterance) return
      clearTimeout(startTimer.current)
      setState({ phase: 'speaking', message: '번역문을 읽고 있습니다.' })
    }
    utterance.onend = () => {
      if (utteranceRef.current !== utterance) return
      release()
      setState({ phase: 'idle', message: '음성 재생이 완료되었습니다.' })
    }
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance) return
      release()
      setState({ phase: 'error', message: event.error === 'not-allowed'
        ? '자동 음성 재생이 차단되었습니다. 재생 버튼을 눌러 주세요.'
        : '음성을 재생할 수 없습니다. 기기의 한국어 음성과 오디오 설정을 확인해 주세요.' })
    }
    startTimer.current = setTimeout(() => {
      if (utteranceRef.current !== utterance) return
      release()
      setState({ phase: 'error', message: '음성이 시작되지 않았습니다. 재생 버튼으로 다시 시도해 주세요.' })
    }, 10_000)
    try {
      window.speechSynthesis.resume()
      window.speechSynthesis.speak(utterance)
    } catch {
      release()
      setState({ phase: 'error', message: '음성 재생을 시작할 수 없습니다. 다시 시도해 주세요.' })
    }
  }, [release, supported])

  return { supported, speak, stop, message: state.message,
    speaking: state.phase === 'starting' || state.phase === 'speaking' }
}
