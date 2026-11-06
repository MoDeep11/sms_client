# SMS Client

수어 JPEG 프레임을 서버에 전송하고 번역문을 표시·읽어주는 React + TypeScript 클라이언트입니다.
Vite, React Router DOM, Emotion, @stomp/stompjs를 사용합니다.

## 실행

Node.js 22.12 이상과 npm을 사용합니다.

```sh
npm ci
npm run dev
```

개발 서버는 5173 포트를 사용합니다. `.env.example`을 `.env`로 복사하고 실제 WebSocket 주소를 설정한 뒤 서버를 재시작하세요.

```dotenv
VITE_TRANSLATION_WS_URL=wss://실제호스트/ws/v1/translations
VITE_TRANSLATION_USE_MOCK=false
```

## 수어 흐름

1. 웹캠 권한을 허용하고 수어 녹화를 누릅니다.
2. STOMP 1.2 연결 후 `/user/queue/translations` 구독, `/app/translations/ready` 요청과 READY 수신을 진행합니다.
3. 서버 정책에 따라 JPEG를 캡처하고 `/app/translations`로 VIDEO_CHUNK를 순서대로 전송합니다.
4. 녹화 중지 시 남은 프레임을 전송하고 COMMIT을 보냅니다.
5. 종료 및 COMMIT 처리 후 FINAL 번역문을 표시하고 한국어 TTS로 한 번 읽습니다. 이후 재생 버튼으로 다시 들을 수 있습니다.

기본 캡처는 640×480, 15fps, 3장 단위입니다. 원본 비율을 유지하며 미리보기만 거울 반전합니다.
서버 메시지 한도에 맞춰 JPEG 품질을 0.85에서 최대 0.1까지 낮추되 해상도와 프레임 묶음 수는 유지합니다. 최저 품질에서도 한도를 넘으면 전송 전에 오류를 표시합니다.
최대 60초 녹화, ACK 재시도, 누락 청크 복구, 최종 결과 대기 제한을 적용합니다.
COMMIT ACK 유실 시 중복 처리를 피하기 위해 자동 재전송하지 않습니다.
연결·전송 오류와 TTS 상태는 화면에 표시합니다.

## 구성

- `src/apis/websocket/stompClient.ts`: 공통 STOMP 생성, 구독, READY 요청, 연결 오류 처리
- `src/services/signTranslationClient.ts`: 수어 응답 검증 연결, ACK, 재전송, FINAL 처리
- `src/services/signServerResponse.ts`: 서버 응답 런타임 검증 및 타입
- `src/services/signRecordingSession.ts`: 캡처, 전송 대기열, 종료, 결과 전달
- `src/hooks/useSignRecording.ts`: 화면과 녹화 세션 연결
- `src/hooks/useTextToSpeech.ts`: 브라우저 SpeechSynthesis 한국어 재생
- `src/config/signRecording.ts`: 녹화 및 통신 제한

음성 모드는 develop의 useSpeechToText를 사용합니다. 말하기 시작/완료 버튼으로 PCM 음성을 서버에 전송하고 번역 결과를 표시합니다.

## MOCK과 검증

개발 환경에서 `VITE_TRANSLATION_USE_MOCK=true`이면 서버 없이 캡처 후 예시 번역을 표시합니다.
JPEG 로컬 저장 API는 제거했으며 MOCK에서도 디스크에 이미지를 저장하지 않습니다.
기존 테스트 이미지와 `.env`는 Git에서 제외합니다.

- `npm run build`: 타입 검사 및 빌드
- `npm run lint`: 정적 검사
- `npm run test:sign`: 캡처, 종료, 통신 오류, 재전송, 결과 전달 자동 테스트
- `npm run check:server`: 이미지 없이 실제 STOMP 연결과 READY 응답 확인

서버 점검은 Node 환경에서 실행되므로 브라우저 Origin 허용 및 실제 AI 번역 성공은 별도 확인해야 합니다.
브라우저 TTS 자동 재생이 차단되면 화면 안내에 따라 재생 버튼을 누르세요.
