"use client";

import * as React from "react";

/**
 * "Read this to me" — step-by-step recipe narration (issue #387).
 *
 * A device-side reader (browser SpeechSynthesis) distinct from an author's own
 * recorded audio (#382): it reads any recipe's steps aloud, one at a time, so a
 * cook with tired eyes or floury hands can just listen. It exposes the index of
 * the step currently being spoken so the page can highlight it, and auto-advances
 * to the next step when one finishes.
 *
 * Robustness notes:
 *  - A monotonic token invalidates a superseded utterance's `onend`, so
 *    stopping / jumping never triggers a stale auto-advance.
 *  - Pause/resume use the native API when available; if a browser drops resume
 *    (a known Chrome quirk on long utterances) the user can still Stop + replay.
 *  - Everything is a no-op when the API is missing (`supported: false`) so the
 *    control can hide itself instead of erroring on unsupported browsers.
 */
export type ReadAloudStatus = "idle" | "playing" | "paused";

export type ReadAloudController = {
  /** Whether SpeechSynthesis is usable in this browser. */
  supported: boolean;
  status: ReadAloudStatus;
  /** Index of the step being read, or -1 when idle. */
  index: number;
  /** Start reading from the top, or resume when paused. */
  play: () => void;
  pause: () => void;
  stop: () => void;
  /** Re-read the current step from its beginning. */
  replay: () => void;
  next: () => void;
  previous: () => void;
};

function hasSpeech(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

export function useReadAloud(steps: string[]): ReadAloudController {
  const [supported, setSupported] = React.useState(false);
  const [status, setStatus] = React.useState<ReadAloudStatus>("idle");
  const [index, setIndex] = React.useState(-1);

  // Latest steps + status without rebuilding callbacks or re-arming utterances.
  const stepsRef = React.useRef(steps);
  stepsRef.current = steps;
  const statusRef = React.useRef(status);
  statusRef.current = status;
  // Bumped on every new/cancelled utterance to invalidate stale onend callbacks.
  const tokenRef = React.useRef(0);

  React.useEffect(() => {
    setSupported(hasSpeech());
  }, []);

  const speakFrom = React.useCallback((start: number) => {
    if (!hasSpeech()) return;
    const list = stepsRef.current;
    const token = (tokenRef.current += 1);
    window.speechSynthesis.cancel();

    if (start < 0 || start >= list.length) {
      setStatus("idle");
      setIndex(-1);
      return;
    }

    const text = (list[start] ?? "").trim();
    setIndex(start);
    setStatus("playing");

    // A blank step shouldn't stall the queue — skip straight to the next.
    if (!text) {
      if (start + 1 < list.length) speakFrom(start + 1);
      else {
        setStatus("idle");
        setIndex(-1);
      }
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      if (tokenRef.current !== token) return; // superseded by stop/jump
      const nextIndex = start + 1;
      if (nextIndex < stepsRef.current.length) speakFrom(nextIndex);
      else {
        setStatus("idle");
        setIndex(-1);
      }
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const play = React.useCallback(() => {
    if (!hasSpeech()) return;
    if (statusRef.current === "paused") {
      window.speechSynthesis.resume();
      setStatus("playing");
      return;
    }
    if (statusRef.current === "playing") return;
    speakFrom(0);
  }, [speakFrom]);

  const pause = React.useCallback(() => {
    if (!hasSpeech() || statusRef.current !== "playing") return;
    window.speechSynthesis.pause();
    setStatus("paused");
  }, []);

  const stop = React.useCallback(() => {
    tokenRef.current += 1; // invalidate any pending auto-advance
    if (hasSpeech()) window.speechSynthesis.cancel();
    setStatus("idle");
    setIndex(-1);
  }, []);

  const replay = React.useCallback(() => {
    speakFrom(index >= 0 ? index : 0);
  }, [speakFrom, index]);

  const next = React.useCallback(() => {
    const list = stepsRef.current;
    if (list.length === 0) return;
    speakFrom(Math.min((index < 0 ? -1 : index) + 1, list.length - 1));
  }, [speakFrom, index]);

  const previous = React.useCallback(() => {
    speakFrom(Math.max((index < 0 ? 0 : index) - 1, 0));
  }, [speakFrom, index]);

  // Never keep talking after the reader unmounts (navigation away).
  React.useEffect(() => {
    return () => {
      tokenRef.current += 1;
      if (hasSpeech()) window.speechSynthesis.cancel();
    };
  }, []);

  return {
    supported,
    status,
    index,
    play,
    pause,
    stop,
    replay,
    next,
    previous,
  };
}
