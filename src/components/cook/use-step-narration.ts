"use client";

import * as React from "react";

/**
 * Kid-facing "Read it to me" narration for a single Cook Mode step (issue #411).
 *
 * Distinct from the hands-free auto-read controller ({@link useSpeech}, #436):
 * this drives one deliberate button, exposing a `speaking` state so the button
 * can flip to "Stop reading" and toggle playback off on a second tap. It is a
 * no-op reporting `supported: false` when the Web Speech API is missing, so the
 * button hides itself offline or on unsupported browsers. Speaking always
 * cancels any prior utterance first, and narration stops on unmount.
 */
export type StepNarration = {
  /** Whether SpeechSynthesis is usable in this browser. */
  supported: boolean;
  /** Whether this control is currently reading a step aloud. */
  speaking: boolean;
  /** Read `text` aloud, or stop if already speaking. */
  toggle: (text: string) => void;
  /** Stop any in-progress narration. */
  stop: () => void;
};

function hasSpeech(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

export function useStepNarration(): StepNarration {
  const [supported, setSupported] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);
  // Mirror `speaking` in a ref so `toggle` can decide play-vs-stop without
  // being re-created on every state change (which would restart callers' effects).
  const speakingRef = React.useRef(false);

  const setSpeakingState = React.useCallback((on: boolean) => {
    speakingRef.current = on;
    setSpeaking(on);
  }, []);

  // Detect after mount so SSR markup stays deterministic.
  React.useEffect(() => {
    setSupported(hasSpeech());
  }, []);

  const stop = React.useCallback(() => {
    if (hasSpeech()) window.speechSynthesis.cancel();
    setSpeakingState(false);
  }, [setSpeakingState]);

  const toggle = React.useCallback(
    (text: string) => {
      if (!hasSpeech()) return;
      // Second tap while speaking: stop.
      if (speakingRef.current) {
        window.speechSynthesis.cancel();
        setSpeakingState(false);
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onend = () => setSpeakingState(false);
      utterance.onerror = () => setSpeakingState(false);
      setSpeakingState(true);
      window.speechSynthesis.speak(utterance);
    },
    [setSpeakingState],
  );

  // Stop talking when Cook Mode unmounts (exit / finish).
  React.useEffect(() => stop, [stop]);

  return { supported, speaking, toggle, stop };
}
