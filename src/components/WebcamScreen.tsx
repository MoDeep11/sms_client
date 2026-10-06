import { useEffect, useRef, useState } from 'react'
import styled from '@emotion/styled'

export type CameraStatus = 'requesting' | 'ready' | 'error'

type WebcamScreenProps = {
  onStatusChange: (status: CameraStatus) => void
}

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return '카메라 접근이 차단되었습니다. 브라우저의 사이트 설정에서 카메라를 허용한 뒤 다시 시도해 주세요.'
      case 'NotFoundError':
        return '연결된 카메라가 없습니다. 웹캠 연결을 확인해 주세요.'
      case 'NotReadableError':
      case 'AbortError':
        return '카메라를 사용할 수 없습니다. 다른 앱에서 사용 중인지 확인한 뒤 다시 시도해 주세요.'
    }
  }
  return '카메라 영상을 표시할 수 없습니다. 카메라 연결과 브라우저 설정을 확인해 주세요.'
}

export default function WebcamScreen({ onStatusChange }: WebcamScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<CameraStatus>('requesting')
  const [message, setMessage] = useState('카메라 연결 중입니다. 권한 요청이 표시되면 허용해 주세요.')

  useEffect(() => {
    const video = videoRef.current
    let disposed = false
    let stream: MediaStream | undefined

    const release = () => {
      stream?.getTracks().forEach((track) => {
        track.onended = null
        track.stop()
      })
      if (video) video.srcObject = null
    }

    const fail = (text: string) => {
      if (disposed) return
      release()
      setMessage(text)
      setStatus('error')
      onStatusChange('error')
    }

    const connect = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('unsupported')
      }
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      if (disposed) {
        acquired.getTracks().forEach((track) => track.stop())
        return
      }
      stream = acquired
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => fail('카메라 연결이 끊겼습니다. 연결을 확인하고 다시 시도해 주세요.')
      })
      if (!video) return
      video.srcObject = stream
      await video.play()
      if (disposed || stream.getVideoTracks().some((track) => track.readyState === 'ended')) return
      setStatus('ready')
      onStatusChange('ready')
    }

    void connect().catch((error: unknown) => {
      fail(error instanceof Error && error.message === 'unsupported'
        ? '카메라를 지원하는 브라우저에서 HTTPS 또는 localhost 주소로 접속해 주세요.'
        : cameraErrorMessage(error))
    })

    return () => {
      disposed = true
      release()
    }
  }, [attempt, onStatusChange])

  return (
    <Screen>
      <Video ref={videoRef} autoPlay muted playsInline aria-label="내 웹캠 영상" />
      {status !== 'ready' && (
        <Message role="status" aria-live="polite">
          <span>{message}</span>
          {status === 'error' && (
            <RetryButton type="button" onClick={() => {
              setStatus('requesting')
              setMessage('카메라 연결 중입니다. 권한 요청이 표시되면 허용해 주세요.')
              onStatusChange('requesting')
              setAttempt((value) => value + 1)
            }}>
              다시 시도
            </RetryButton>
          )}
        </Message>
      )}
    </Screen>
  )
}

const Screen = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  background: #111827;
`

const Video = styled.video`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: scaleX(-1);
`

const Message = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 96px 24px 24px;
  color: #fff;
  text-align: center;
`

const RetryButton = styled.button`
  border: 1px solid #fff;
  border-radius: 8px;
  padding: 8px 20px;
  background: #21406a;
  color: #fff;
  cursor: pointer;
`
