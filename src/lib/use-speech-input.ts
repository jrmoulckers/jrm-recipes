"use client";

import * as React from "react";

/**
 * Voice dictation for editor text fields (issue #373).
 *
 * A thin, strongly-typed wrapper over the browser SpeechRecognition API so
 * cooks whose hands tire of typing can just talk. It is opt-in and per-field:
 * `start`/`stop`/`toggle` drive a single recognition session and each final
 * transcript chunk is handed back via `onResult` for the caller to append
 * (never overwrite). When the API is missing it reports `supported: false` so
 * the UI can hide or disable itself instead of erroring on Safari/iOS.
 */
export type SpeechInputController = {
  /** Whether SpeechRecognition is usable in this browser. */
  supported: boolean;
  /** Whether a dictation session is currently active. */
  listening: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
};

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; 0: RecognitionAlternative };
type RecognitionResultList = {
  length: number;
  [index: number]: RecognitionResult;
};
type RecognitionEvent = {
  resultIndex: number;
  results: RecognitionResultList;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function useSpeechInput({
  onResult,
  lang = "en-US",
}: {
  onResult: (text: string) => void;
  lang?: string;
}): SpeechInputController {
  const [supported, setSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);

  // Keep the latest callback without rebuilding the recognition session.
  const onResultRef = React.useRef(onResult);
  onResultRef.current = onResult;

  // Detect after mount so SSR markup stays deterministic.
  React.useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  const stop = React.useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = React.useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let chunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) chunk += result[0].transcript;
      }
      const text = chunk.trim();
      if (text) onResultRef.current(text);
    };
    const finish = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onend = finish;
    recognition.onerror = finish;

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [lang]);

  const toggle = React.useCallback(() => {
    if (recognitionRef.current) stop();
    else start();
  }, [start, stop]);

  // Never keep listening after the field unmounts.
  React.useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, start, stop, toggle };
}

/** Append dictated text to an existing value without wiping what's there. */
export { appendDictation } from "~/lib/append-dictation";
