import { useCallback, useEffect, useRef, useState } from "react";
import type { Client } from "@stomp/stompjs";
import {
  connectTranslation,
  disconnectTranslation,
} from "@/apis/websocket/stompClient";
import { sendAudioChunk, sendCommit } from "@/apis/websocket/translation";

const SAMPLE_RATE = 16000;
const CHUNK_MS = 1000;
const MAX_CHUNKS = 30;

const WORKLET_SOURCE = `
class PcmChunker extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = options.processorOptions.size;
    this.buffer = new Int16Array(this.size);
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.filled === this.size) {
        this.port.postMessage(this.buffer.slice());
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-chunker', PcmChunker);
`;

function toBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength,
  );
  let binary = "";

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  return btoa(binary);
}

export function useSpeechToText(enabled: boolean) {
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [partialText, setPartialText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const clientRef = useRef<Client | null>(null);
  const requestIdRef = useRef("");
  const sequenceRef = useRef(0);
  const startedAtRef = useRef(0);
  const processedRef = useRef(0);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  const stopCapture = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void contextRef.current?.close();
    contextRef.current = null;

    setRecording(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const client = connectTranslation({
      mode: "SPEECH_TO_TEXT",

      onMessage: (response) => {
        switch (response.type) {
          case "READY":
            setReady(true);
            setErrorMessage("");
            break;

          case "ACK": {
            const ack = response.data;
            if (ack.nextExpectedSequence <= ack.acknowledgedSequence) {
              setErrorMessage(
                `청크 ${ack.nextExpectedSequence}번이 저장되지 않았습니다.`,
              );
            }
            break;
          }

          case "PARTIAL": {
            const partial = response.data;
            if (partial.processedSequence < processedRef.current) break;

            processedRef.current = partial.processedSequence;
            setPartialText(partial.result.partialText);
            break;
          }

          case "FINAL": {
            const final = response.data;
            setFinalText(final.result.text);
            setPartialText("");
            break;
          }

          case "ERROR":
            setErrorMessage(response.error.message);
            break;
        }
      },

      onError: (message) => {
        setReady(false);
        setErrorMessage(message);
      },
    });

    clientRef.current = client;

    return () => {
      clientRef.current = null;
      stopCapture();
      setReady(false);
      void disconnectTranslation(client);
    };
  }, [enabled, stopCapture]);

  const start = useCallback(async () => {
    const client = clientRef.current;
    if (!client || recording) return;

    requestIdRef.current = crypto.randomUUID();
    sequenceRef.current = 0;
    processedRef.current = 0;
    startedAtRef.current = Date.now();
    setPartialText("");
    setFinalText("");
    setErrorMessage("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext({ sampleRate: SAMPLE_RATE });

      const url = URL.createObjectURL(
        new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
      );
      await context.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      const node = new AudioWorkletNode(context, "pcm-chunker", {
        processorOptions: { size: (SAMPLE_RATE * CHUNK_MS) / 1000 },
      });

      node.port.onmessage = (event: MessageEvent<Int16Array>) => {
        if (sequenceRef.current >= MAX_CHUNKS) return;

        const sequence = ++sequenceRef.current;
        const capturedAt = new Date(
          startedAtRef.current + (sequence - 1) * CHUNK_MS,
        ).toISOString();

        sendAudioChunk(client, requestIdRef.current, sequence, {
          capturedAt,
          encoding: "PCM_S16LE",
          sampleRateHz: SAMPLE_RATE,
          channels: 1,
          durationMs: CHUNK_MS,
          contentBase64: toBase64(event.data),
          locale: "ko-KR",
        });
      };

      context.createMediaStreamSource(stream).connect(node);

      streamRef.current = stream;
      contextRef.current = context;
      setRecording(true);
    } catch {
      setErrorMessage("마이크를 사용할 수 없습니다.");
      stopCapture();
    }
  }, [recording, stopCapture]);

  const commit = useCallback(() => {
    const client = clientRef.current;
    const lastSequence = sequenceRef.current;

    stopCapture();

    if (!client || lastSequence < 1) return;

    sendCommit(client, requestIdRef.current, lastSequence);
  }, [stopCapture]);

  return {
    ready,
    recording,
    partialText,
    finalText,
    errorMessage,
    start,
    commit,
  };
}
