import styled from "@emotion/styled";
import Button from "@/components/Translate_Button";
import Header from "@/components/Header";
import { useState } from "react";
import WebcamScreen from "@/components/WebcamScreen";
import type { CameraStatus } from "@/components/WebcamScreen";
import MicrophoneScreen from "@/components/MicrophoneScreen";
import type { MicrophoneStatus } from "@/components/MicrophoneScreen";

const Translate_Sign = () => {
  const [change, setChange] = useState(true);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('requesting');
  const [microphoneStatus, setMicrophoneStatus] = useState<MicrophoneStatus>('requesting');
  const activeStatus = change ? cameraStatus : microphoneStatus;
  const deviceName = change ? '카메라' : '마이크';
  const deviceReady = activeStatus === 'ready';
  const statusText = activeStatus === 'ready'
    ? `${deviceName} 준비 완료`
    : activeStatus === 'error'
      ? `${deviceName} 연결 확인 필요`
      : activeStatus === 'muted'
        ? '마이크 입력 일시 중단'
        : `${deviceName} 연결 중`;

  return (
    <Main voiceMode={!change}>
      <Header></Header>
      <Change_mode voiceMode={!change}>
        <Mic_mode
          onClick={() => {
            if (change) setMicrophoneStatus('requesting');
            setChange(false);
          }}
          change={change}
        >
          음성으로 말하기
        </Mic_mode>
        <Webcam_mode
          onClick={() => {
            if (!change) setCameraStatus('requesting');
            setChange(true);
          }}
          change={change}
        >
          수어로 말하기
        </Webcam_mode>
      </Change_mode>
      <Webcam_screen voiceMode={!change}>
        {change ? (
          <WebcamScreen onStatusChange={setCameraStatus} />
        ) : (
          <MicrophoneScreen onStatusChange={setMicrophoneStatus} />
        )}
      </Webcam_screen>
      <Translate_container voiceMode={!change}>
        <Translate_box>
          <Translate_KR>{change ? '이것은 한국어 입니다.' : '언제부터 아프기 시작했나요?'}</Translate_KR>
          <Translate_EN>{change ? 'This is English' : 'When did it start hurting?'}</Translate_EN>
          <Translate_wordbox>
            {(change ? ['이것', '은(는)', '한국어', '이다'] : ['언제', '아프다', '시작하다']).map((word) => (
              <Button key={word} onClick={() => console.log("클릭")}>{word}</Button>
            ))}

          </Translate_wordbox>
        </Translate_box>
        <Ready_button ready={deviceReady} role="status" aria-live="polite">
          <Ready_dot></Ready_dot>
          <Ready_text>{statusText}</Ready_text>
        </Ready_button>
      </Translate_container>
    </Main>
  );
};

const Main = styled.div<{ voiceMode: boolean }>`
  width: 100%;
  height: 100vh;
  background-color: gray;
  position: relative;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  ${({ voiceMode }) => voiceMode && `
    display: flex;
    flex-direction: column;
    min-height: 640px;
    height: 100dvh;
    background-color: #fff;
    > p { flex-shrink: 0; }
  `}
  p {
    // 이거는 헤더가 대체할 자리입니다.
    margin: 0;
    height: 56px;
    background-color: antiquewhite;
  }
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
  height: 53px;
  border-radius: 999px;
  padding: 4px;
  display: flex;
  gap: 0px;
  align-items: center;
  justify-content: center;
`;
const Mic_mode = styled.button<{ change: boolean }>`
  min-width: fit-content;
  width: 100%;
  height: 100%;
  padding: 8px 14px;
  border: none;
  border-radius: 999px;
  color: ${(props) => (props.change ? "#21406A" : "#ffffff")};
  background-color: ${(props) => (props.change ? "#ffffff" : "#21406A")};
  transition: color 0.2s ease;
  font-size: 18px;
  font-weight: 600;
`;
const Webcam_mode = styled.button<{ change: boolean }>`
  width: 100%;
  min-width: fit-content;
  height: 100%;
  padding: 8px 14px;
  border: none;
  border-radius: 999px;
  color: ${(props) => (props.change ? "#ffffff" : "#21406A")};
  background-color: ${(props) => (props.change ? "#21406a" : "#ffffff")};
  transition: color 0.2s ease;
  font-size: 18px;
  font-weight: 600;
`;
const Webcam_screen = styled.div<{ voiceMode: boolean }>`
  width: 100%;
  height: 66%;
  background-color: #111827;
  ${({ voiceMode }) => voiceMode && `
    flex: 1;
    min-height: 300px;
    height: auto;
    background-color: #fff;
  `}
`;
const Translate_container = styled.div<{ voiceMode: boolean }>`
  width: 100%;
  height: 28%;
  padding: 32px 388px;
  ${({ voiceMode }) => voiceMode && `
    flex-shrink: 0;
    height: 30%;
    min-height: 240px;
    padding: 16px 24px 72px;
  `}
  display: flex;
  flex-direction: column;
  position: relative;
  background-color: #fff;
  box-sizing: border-box;
`;
const Translate_box = styled.div`
  text-align: center;
`;
const Translate_KR = styled.div`
  font-size: 32px;
  font-weight: 700;
`;
const Translate_EN = styled.div`
  font-size: 18px;
  font-weight: 400;
`;
const Translate_wordbox = styled.div`
  margin-top: 24px;
  display: flex;
  gap: 12px;
  justify-content: center;
  span {
    background-color: aliceblue;
    padding: 8px 20px;
  }
`;
const Ready_button = styled.div<{ ready: boolean }>`
  position: absolute;
  display: flex;
  align-items: center;
  gap: 10px;
  background-color: ${({ ready }) => ready ? '#20af6133' : '#f1f5f9'};
  color: ${({ ready }) => ready ? '#167c45' : '#475569'};
  border: 1px solid currentColor;
  border-radius: 99px;
  padding: 6px 20px;
  right: 36px;
  bottom: 20px;
`;
const Ready_dot = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 99px;
  background-color: currentColor;
`;
const Ready_text = styled.div``;

export default Translate_Sign;
