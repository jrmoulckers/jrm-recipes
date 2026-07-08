import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStepNarration } from "./use-step-narration";

class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

describe("useStepNarration (#411)", () => {
  let speakSpy: ReturnType<typeof vi.fn>;
  let cancelSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    speakSpy = vi.fn();
    cancelSpy = vi.fn();
    vi.stubGlobal("speechSynthesis", { speak: speakSpy, cancel: cancelSpy });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports supported when SpeechSynthesis exists", () => {
    const { result } = renderHook(() => useStepNarration());
    expect(result.current.supported).toBe(true);
    expect(result.current.speaking).toBe(false);
  });

  it("toggle() speaks trimmed text and marks speaking", () => {
    const { result } = renderHook(() => useStepNarration());
    act(() => result.current.toggle("  Whisk the eggs.  "));
    expect(cancelSpy).toHaveBeenCalled();
    expect(speakSpy).toHaveBeenCalledTimes(1);
    const utterance = speakSpy.mock.calls[0]![0] as FakeUtterance;
    expect(utterance.text).toBe("Whisk the eggs.");
    expect(result.current.speaking).toBe(true);
  });

  it("toggle() again while speaking stops playback", () => {
    const { result } = renderHook(() => useStepNarration());
    act(() => result.current.toggle("Whisk the eggs."));
    expect(result.current.speaking).toBe(true);

    cancelSpy.mockClear();
    speakSpy.mockClear();
    act(() => result.current.toggle("Whisk the eggs."));
    expect(cancelSpy).toHaveBeenCalled();
    expect(speakSpy).not.toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it("clears speaking when the utterance ends", () => {
    const { result } = renderHook(() => useStepNarration());
    act(() => result.current.toggle("Whisk the eggs."));
    const utterance = speakSpy.mock.calls[0]![0] as FakeUtterance;
    act(() => utterance.onend?.());
    expect(result.current.speaking).toBe(false);
  });

  it("toggle() ignores empty / whitespace-only text", () => {
    const { result } = renderHook(() => useStepNarration());
    act(() => result.current.toggle("   "));
    expect(speakSpy).not.toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it("stop() cancels in-progress narration", () => {
    const { result } = renderHook(() => useStepNarration());
    act(() => result.current.toggle("Whisk the eggs."));
    cancelSpy.mockClear();
    act(() => result.current.stop());
    expect(cancelSpy).toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it("cancels on unmount (navigating away / leaving Cook Mode)", () => {
    const { unmount } = renderHook(() => useStepNarration());
    cancelSpy.mockClear();
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("is unsupported and inert when the API is missing", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("speechSynthesis", undefined);
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    const { result } = renderHook(() => useStepNarration());
    expect(result.current.supported).toBe(false);
    expect(() => act(() => result.current.toggle("hello"))).not.toThrow();
  });
});
