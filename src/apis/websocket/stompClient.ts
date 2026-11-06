import type { TranslationMode, TranslationResponse } from './websocket.types'
import { Client, Versions } from '@stomp/stompjs'
import { TRANSPORT } from '../../config/signRecording.ts'

type Options = {
  url: string
  mode: 'SIGN_TO_SPEECH' | 'SPEECH_TO_TEXT'
  onConnect: () => void
  onMessage: (value: unknown) => void
  onError: (error: Error) => void
  onClose: () => void
}

// Construction and activation are separate so callers can install READY waiters first.
export function createTranslationClient(options: Options): Client {
  const endpoint = new URL(options.url)
  if (!['ws:', 'wss:'].includes(endpoint.protocol)) throw new Error('서버 주소는 ws:// 또는 wss://로 설정해 주세요.')
  endpoint.searchParams.set('mode', options.mode)
  const client = new Client({
    brokerURL: endpoint.toString(),
    stompVersions: new Versions(['1.2']),
    reconnectDelay: TRANSPORT.reconnectDelayMs,
    connectionTimeout: TRANSPORT.connectionTimeoutMs,
    splitLargeFrames: true,
    maxWebSocketChunkSize: TRANSPORT.webSocketChunkBytes,
    onConnect: () => {
      options.onConnect()
      client.subscribe('/user/queue/translations', message => {
        try { options.onMessage(JSON.parse(message.body)) }
        catch (error) { options.onError(error instanceof Error ? error : new Error('서버 응답을 읽을 수 없습니다.')) }
      })
      client.publish({ destination: '/app/translations/ready', headers: { 'content-type': 'application/json' }, body: '{}' })
    },
    onStompError: frame => options.onError(new Error(frame.headers.message || 'STOMP 연결 오류가 발생했습니다.')),
    onWebSocketError: () => options.onError(new Error('WebSocket 연결에 실패했습니다. 서버 주소, 터널 실행 상태와 허용 Origin을 확인해 주세요.')),
    onWebSocketClose: () => { if (client.active) options.onClose() },
  })
  return client
}

// Compatibility entry point for develop's speech-to-text hook.
export function connectTranslation(options: {
  mode: TranslationMode
  onMessage: (response: TranslationResponse) => void
  onError?: (message: string) => void
}): Client {
  const url = import.meta.env.VITE_TRANSLATION_WS_URL?.trim()
  if (!url) throw new Error('환경변수가 설정되지 않았습니다.')
  let reported = false
  const report = (message: string) => {
    if (reported) return
    reported = true
    options.onError?.(message)
  }
  const client = createTranslationClient({
    url, mode: options.mode,
    onConnect: () => { reported = false },
    onMessage: value => options.onMessage(value as TranslationResponse),
    onError: error => report(error.message),
    onClose: () => report('WebSocket 연결이 끊어졌습니다. 재연결을 시도합니다.'),
  })
  client.activate()
  return client
}

export async function disconnectTranslation(client: Client): Promise<void> {
  await client.deactivate()
}
