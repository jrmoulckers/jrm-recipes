"use client";

import * as React from "react";

/**
 * Hands-free "read aloud" for Cook Mode (issue #436). A thin wrapper over the
 * browser SpeechSynthesis API: opt-in, session-scoped, and a no-op (reporting
 * `supported: false`) when the API is missing so the UI can hide itself.
 *
 * Speaking always cancels the previous utterance first, so a rapid step change
 * never stacks up a backlog of instructions. The hook also cancels on unmount
 * (leaving Cook Mode / finishing) so nothing keeps talking to an empty kitchen.
 */
export type SpeechController = {
  /** Whether SpeechSynthesis is usable in this browser. */
  supported: boolean;
  /** Whether read-aloud is currently switched on (persists for the session). */
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** Speak text now, cancelling anything already in progress. */
  speak: (text: string) => void;
  /** Stop any in-progress speech. */
  cancel: () => void;
};

function hasSpeech(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

export function useSpeech(): SpeechController {
  const [supported, setSupported] = React.useState(false);
  const [enabled, setEnabledState] = React.useState(false);

  // Detect after mount so SSR markup stays deterministic.
  React.useEffect(() => {
    setSupported(hasSpeech());
  }, []);

  const cancel = React.useCallback(() => {
    if (!hasSpeech()) return;
    window.speechSynthesis.cancel();
  }, []);

  const speak = React.useCallback((text: string) => {
    if (!hasSpeech()) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const setEnabled = React.useCallback(
    (on: boolean) => {
      setEnabledState(on);
      // Switching off must silence any current utterance immediately.
      if (!on) cancel();
    },
    [cancel],
  );

  // Stop talking when Cook Mode unmounts (exit / finish).
  React.useEffect(() => cancel, [cancel]);

  return { supported, enabled, setEnabled, speak, cancel };
}
