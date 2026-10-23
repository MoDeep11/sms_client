import { Client, Versions, type IMessage } from "@stomp/stompjs";
import type { TranslationMode, TranslationResponse } from "./websocket.types";

const WS_BASE_URL = import.meta.env.VITE_TRANSLATION_WS_URL;

interface ConnectTranslationOptions {
  mode: TranslationMode;
  onMessage: (response: TranslationResponse) => void;
  onError?: (message: string) => void;
}

export function connectTranslation({
  mode,
  onMessage,
  onError,
}: ConnectTranslationOptions): Client {
  if (!WS_BASE_URL) {
    throw new Error("환경변수가 설정되지 않았습니다.");
  }

  const brokerURL = new URL(WS_BASE_URL);

  brokerURL.searchParams.set("mode", mode);

  let reported = false;
  const report = (message: string) => {
    if (reported) return;

    reported = true;
    onError?.(message);
  };

  const client = new Client({
    brokerURL: brokerURL.toString(),
    stompVersions: new Versions([Versions.V1_2]),
    connectionTimeout: 10000,
    reconnectDelay: 5000,
    splitLargeFrames: true,
    maxWebSocketChunkSize: 16 * 1024,

    onConnect: () => {
      reported = false;

      client.subscribe("/user/queue/translations", (message: IMessage) => {
        try {
          const response: TranslationResponse = JSON.parse(message.body);

          onMessage(response);
        } catch {
          onError?.("서버 응답을 가져오지 못했습니다.");
        }
      });

      client.publish({
        destination: "/app/translations/ready",
        headers: {
          "content-type": "application/json",
        },
        body: "{}",
      });
    },

    onStompError: (frame) => {
      report(frame.headers["message"] ?? "STOMP 오류가 발생했습니다.");
    },

    onWebSocketError: () => {
      report("WebSocket 연결 오류가 발생했습니다.");
    },

    onWebSocketClose: () => {
      if (!client.active) return;

      report("WebSocket 연결이 끊어졌습니다. 재연결을 시도합니다.");
    },
  });

  client.activate();

  return client;
}

export async function disconnectTranslation(client: Client): Promise<void> {
  await client.deactivate();
}
