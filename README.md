# SMS Client

수어와 음성을 텍스트로 연결하는 소통 서비스의 프론트엔드입니다.
현재는 개발 기본 설정과 시작 화면만 포함합니다.

## 시작하기

Node.js 22.12 이상과 npm을 사용합니다.

```sh
npm ci
npm run dev
```

## 명령어

- `npm run dev`: 개발 서버 실행
- `npm run build`: TypeScript 검사 후 프로덕션 빌드 (`dist/`)
- `npm run typecheck`: TypeScript 검사
- `npm run lint`: ESLint 검사
- `npm run preview`: 빌드 결과 로컬 확인

## 구성

- React + TypeScript + Vite
- React Router DOM: `/` 시작 화면, `*` 404 화면
- Emotion styled: 컴포넌트 스타일, 전역 스타일, 타입이 적용된 공통 테마
- ESLint: TypeScript, React Hooks, Fast Refresh 규칙
- `@/` 경로 별칭: `src/`를 기준으로 import

```text
src/
  main.tsx           # 앱 진입점과 Provider
  App.tsx            # 라우트 정의
  pages/             # 페이지 컴포넌트
  styles/            # 전역 스타일, 테마, Emotion 타입
```

새 페이지는 `src/pages/`에 만들고 `src/App.tsx`에 라우트를 등록합니다.
공통 색상은 `src/styles/theme.ts`에서 관리합니다.

배포 시 BrowserRouter의 하위 URL 직접 접근을 위해 서버에서 앱 경로를
`index.html`로 연결하는 SPA fallback 설정이 필요합니다.
