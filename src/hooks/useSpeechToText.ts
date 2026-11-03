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
    this.port.onmessage = () => {
      this.port.postMessage({ samples: this.buffer.slice(0, this.filled), final: true });
      this.filled = 0;
    };
  }
  process(inputs) {
    const channel = inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.filled === this.size) {
        this.port.postMessage({ samples: this.buffer.slice(), final: false });
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
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const clientRef = useRef<Client | null>(null);
  const requestIdRef = useRef("");
  const sequenceRef = useRef(0);
  const startedAtRef = useRef(0);
  const processedRef = useRef(0);

  const startingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const flushDoneRef = useRef<(() => void) | null>(null);

  const stopCapture = useCallback(() => {
    nodeRef.current = null;

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
        if ("requestId" in response && response.requestId !== requestIdRef.current) {
          return;
        }

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

          case "FALLBACK":
            setFallbackMessage(response.data.result.message);
            setPartialText("");
            break;

          case "ERROR":
            setErrorMessage(response.error.message);
            break;
        }
      },

      onError: (message) => {
        setReady(false);
        setErrorMessage(message);
        stopCapture();
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
    if (!client || recording || startingRef.current) return;

    startingRef.current = true;

    requestIdRef.current = crypto.randomUUID();
    sequenceRef.current = 0;
    processedRef.current = 0;
    setPartialText("");
    setFinalText("");
    setFallbackMessage("");
    setErrorMessage("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      if (clientRef.current !== client) {
        stopCapture();
        return;
      }

      const context = new AudioContext({ sampleRate: SAMPLE_RATE });
      contextRef.current = context;

      const url = URL.createObjectURL(
        new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
      );
      await context.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      if (clientRef.current !== client) {
        stopCapture();
        return;
      }

      const node = new AudioWorkletNode(context, "pcm-chunker", {
        processorOptions: { size: (SAMPLE_RATE * CHUNK_MS) / 1000 },
      });

      node.port.onmessage = (
        event: MessageEvent<{ samples: Int16Array; final: boolean }>,
      ) => {
        const { samples, final } = event.data;

        if (samples.length === 0 || sequenceRef.current >= MAX_CHUNKS) {
          if (final) flushDoneRef.current?.();
          return;
        }

        const sequence = sequenceRef.current + 1;
        const capturedAt = new Date(
          startedAtRef.current + (sequence - 1) * CHUNK_MS,
        ).toISOString();
        const durationMs = Math.round((samples.length / SAMPLE_RATE) * 1000);

        try {
          sendAudioChunk(client, requestIdRef.current, sequence, {
            capturedAt,
            encoding: "PCM_S16LE",
            sampleRateHz: SAMPLE_RATE,
            channels: 1,
            durationMs,
            contentBase64: toBase64(samples),
            locale: "ko-KR",
          });
        } catch {
          setErrorMessage("연결이 끊겨 음성을 전송하지 못했습니다.");
          stopCapture();
          flushDoneRef.current?.();
          return;
        }

        sequenceRef.current = sequence;

        if (final) {
          flushDoneRef.current?.();
          return;
        }

        if (sequence >= MAX_CHUNKS) {
          stopCapture();

          try {
            sendCommit(client, requestIdRef.current, sequence);
            setErrorMessage("최대 30초까지 말할 수 있어 자동으로 전송했습니다.");
          } catch {
            setErrorMessage("연결이 끊겨 전송하지 못했습니다.");
          }
        }
      };

      startedAtRef.current = Date.now();
      nodeRef.current = node;
      context.createMediaStreamSource(stream).connect(node);

      setRecording(true);
    } catch {
      setErrorMessage("마이크를 사용할 수 없습니다.");
      stopCapture();
    } finally {
      startingRef.current = false;
    }
  }, [recording, stopCapture]);

  const commit = useCallback(async () => {
    const client = clientRef.current;
    const node = nodeRef.current;

    if (node) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };

        flushDoneRef.current = finish;
        node.port.postMessage("flush");
        setTimeout(finish, 200);
      });

      flushDoneRef.current = null;
    }

    const lastSequence = sequenceRef.current;

    stopCapture();

    if (!client || lastSequence < 1) return;

    try {
      sendCommit(client, requestIdRef.current, lastSequence);
    } catch {
      setErrorMessage("연결이 끊겨 전송하지 못했습니다.");
    }
  }, [stopCapture]);

  return {
    ready,
    recording,
    partialText,
    finalText,
    fallbackMessage,
    errorMessage,
    start,
    commit,
  };
}
