import styled from "@emotion/styled";
import Button from "@/components/Translate_Button";
import Header from "@/components/Header";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSignRecording } from "@/hooks/useSignRecording";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import WebcamScreen from "@/components/WebcamScreen";
import type { CameraStatus } from "@/components/WebcamScreen";
import MicrophoneScreen from "@/components/MicrophoneScreen";
import type { MicrophoneStatus } from "@/components/MicrophoneScreen";

import { useSpeechToText } from "@/hooks/useSpeechToText";

type TranslationMode = 'sign' | 'voice';

const Translate_Sign = () => {
  const [params] = useSearchParams();
  const mode: TranslationMode = params.get('mode') === 'voice' ? 'voice' : 'sign';
  // URL changes (including browser Back) dispose the previous media session.
  return <TranslationScreen key={mode} mode={mode} />;
};

const TranslationScreen = ({ mode }: { mode: TranslationMode }) => {
  const [, setParams] = useSearchParams();
  const isSignMode = mode === 'sign';
  const captureRef = useRef<HTMLVideoElement>(null);
  const speech = useTextToSpeech();
  const voice = useSpeechToText(!isSignMode);
  const sign = useSignRecording(captureRef, speech.speak);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('requesting');
  const [microphoneStatus, setMicrophoneStatus] = useState<MicrophoneStatus>('requesting');
  const activeStatus = isSignMode ? cameraStatus : microphoneStatus;
  const deviceName = isSignMode ? '카메라' : '마이크';
  const deviceReady = activeStatus === 'ready';
  const statusText = activeStatus === 'ready'
    ? `${deviceName} 준비 완료`
    : activeStatus === 'error'
      ? `${deviceName} 연결 확인 필요`
      : activeStatus === 'muted'
        ? '마이크 입력 일시 중단'
        : `${deviceName} 연결 중`;

  return (
    <Main voiceMode={!isSignMode}>
      <Header></Header>
      <Change_mode voiceMode={!isSignMode}>
        <ModeButton
          type="button"
          active={mode === 'voice'}
          aria-pressed={mode === 'voice'}
          disabled={sign.recording || sign.busy || voice.recording}
          onClick={() => setParams({ mode: 'voice' })}
        >
          음성으로 말하기
        </ModeButton>
        <ModeButton
          type="button"
          active={mode === 'sign'}
          aria-pressed={mode === 'sign'}
          disabled={sign.recording || sign.busy || voice.recording}
          onClick={() => setParams({ mode: 'sign' })}
        >
          수어로 말하기
        </ModeButton>
      </Change_mode>
      <Webcam_screen voiceMode={!isSignMode}>
        {isSignMode ? (
          <WebcamScreen onStatusChange={setCameraStatus} captureRef={captureRef} />
        ) : (
          <MicrophoneScreen onStatusChange={setMicrophoneStatus} />
        )}
      </Webcam_screen>
      <Translate_container voiceMode={!isSignMode}>
        <Translate_box>
          <Translate_KR aria-live="polite">{isSignMode ? (sign.result || '수어 녹화 버튼을 눌러 시작해 주세요.') : (voice.finalText || voice.fallbackMessage || voice.partialText || '말하기를 시작해 주세요.')}</Translate_KR>
          <Recording_actions>
            <Button
              disabled={isSignMode ? sign.busy || (!sign.recording && !deviceReady) : (!voice.recording && (!voice.ready || !deviceReady))}
              aria-pressed={isSignMode ? sign.recording : undefined}
              onClick={isSignMode ? () => {
                if (!sign.recording) {
                  speech.stop();
                }
                void sign.toggle();
              } : () => { void (voice.recording ? voice.commit() : voice.start()); }}
            >
              {isSignMode ? (sign.recording ? '녹화 중지' : '수어 녹화') : (voice.recording ? '말하기 완료' : '말하기 시작')}
            </Button>
            {isSignMode && sign.finalText && (
              <Button disabled={!speech.supported || sign.recording || sign.busy}
                onClick={() => speech.speaking ? speech.stop() : speech.speak(sign.finalText)}>
                {speech.speaking ? '재생 중지' : '재생'}
              </Button>
            )}
          </Recording_actions>
          {isSignMode && sign.progress && <p role={sign.progress.phase === 'error' ? 'alert' : 'status'}>{sign.progress.message}</p>}
          {isSignMode && speech.message && <p role="status">{speech.message}</p>}
          {isSignMode && sign.isMock && <p>테스트 모드: 예시 번역을 사용합니다.</p>}
        </Translate_box>
        <Ready_button ready={deviceReady && (isSignMode || (voice.ready && !voice.errorMessage))} role="status" aria-live="polite">
          <Ready_dot></Ready_dot>
          <Ready_text>{isSignMode ? statusText : voice.errorMessage || (!voice.ready ? "서버 연결 중" : statusText)}</Ready_text>
        </Ready_button>
      </Translate_container>
    </Main>
  );
};

const Main = styled.div<{ voiceMode: boolean }>`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-width: 0;
  overflow: hidden;
  background-color: gray;
  position: relative;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  ${({ voiceMode }) => voiceMode && `
    background-color: #fff;
  `}
`;
const Change_mode = styled.div<{ voiceMode: boolean }>`
  position: absolute;
  z-index: 1;
  top: 88px;
  left: 36px;
  ${({ voiceMode }) => voiceMode && `
    border: 1px solid #21406a;
    max-width: calc(100% - 32px);
    left: clamp(16px, 2.6vw, 36px);
  `}
  background-color: #fff;
  width: 318px;
  max-width: calc(100% - 72px);
  height: 53px;
  border-radius: 999px;
  padding: 4px;
  display: flex;
  gap: 0px;
  align-items: center;
  justify-content: center;
`;
const ModeButton = styled.button<{ active: boolean }>`
  min-width: fit-content;
  width: 100%;
  height: 100%;
  padding: 8px 14px;
  border: none;
  border-radius: 999px;
  color: ${({ active }) => active ? '#fff' : '#21406a'};
  background-color: ${({ active }) => active ? '#21406a' : '#fff'};
  transition: color 0.2s ease;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;
const Webcam_screen = styled.div<{ voiceMode: boolean }>`
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  overflow: hidden;
  background-color: #111827;
  ${({ voiceMode }) => voiceMode && `
    background-color: #fff;
  `}
`;
const Translate_container = styled.div<{ voiceMode: boolean }>`
  flex: 0 1 auto;
  min-height: 0;
  width: 100%;
  max-height: calc(100dvh - 156px);
  padding: 20px 36px 16px;
  gap: 12px;
  ${({ voiceMode }) => voiceMode && `
    padding-top: 16px;
  `}
  display: flex;
  flex-direction: column;
  position: relative;
  background-color: #fff;
  box-sizing: border-box;
`;
const Translate_box = styled.div`
  min-height: 0;
  min-width: 0;
  overflow: auto;
  overflow-wrap: anywhere;
  text-align: center;
`;
const Translate_KR = styled.div`
  font-size: clamp(22px, 3.2dvh, 32px);
  font-weight: 700;
`;

const Recording_actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
`;



const Ready_button = styled.div<{ ready: boolean }>`
  align-self: flex-end;
  flex-shrink: 0;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  background-color: ${({ ready }) => ready ? '#20af6133' : '#f1f5f9'};
  color: ${({ ready }) => ready ? '#167c45' : '#475569'};
  border: 1px solid currentColor;
  border-radius: 99px;
  padding: 6px 20px;
`;
const Ready_dot = styled.div`
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 99px;
  background-color: currentColor;
`;
const Ready_text = styled.div``;

export default Translate_Sign;
