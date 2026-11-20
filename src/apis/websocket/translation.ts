import type { Client } from "@stomp/stompjs";
import type {
  AudioChunkInput,
  AudioChunkRequest,
  CommitRequest,
} from "./websocket.types";

function publish(client: Client, body: AudioChunkRequest | CommitRequest) {
  client.publish({
    destination: "/app/translations",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function sendAudioChunk(
  client: Client,
  requestId: string,
  sequence: number,
  input: AudioChunkInput,
) {
  publish(client, {
    type: "AUDIO_CHUNK",
    requestId,
    sequence,
    timestamp: new Date().toISOString(),
    input,
  });
}

export function sendCommit(
  client: Client,
  requestId: string,
  lastSequence: number,
) {
  publish(client, {
    type: "COMMIT",
    requestId,
    timestamp: new Date().toISOString(),
    input: { lastSequence, reason: "USER_FINISHED" },
  });
}
