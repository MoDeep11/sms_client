import { loadEnv } from 'vite'
import { SignTranslationClient } from '../src/services/signTranslationClient.ts'

// Connection/READY diagnostic only. No webcam or saved images are transmitted.
const env = loadEnv('development', process.cwd(), 'VITE_')
const url = env.VITE_TRANSLATION_WS_URL?.trim()
if (!url) throw new Error('.env에 VITE_TRANSLATION_WS_URL을 설정해 주세요. .env.example은 자동으로 읽지 않습니다.')
if (env.VITE_TRANSLATION_USE_MOCK === 'true') {
  throw new Error('서버 시험 전에 VITE_TRANSLATION_USE_MOCK=false로 변경해 주세요.')
}

const client = new SignTranslationClient(url, () => {})
try {
  console.log('STOMP 연결 → 응답 구독 → READY 요청 중...')
  const policy = await client.connect()
  console.log('READY 수신 성공:', JSON.stringify(policy))
  console.log('웹캠 전송은 npm run dev 실행 후 수어 녹화 버튼으로 확인하세요.')
  console.log('이 검사는 Node 연결입니다. 브라우저 Origin 허용과 실제 번역은 별도 확인이 필요합니다.')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  client.close()
}
