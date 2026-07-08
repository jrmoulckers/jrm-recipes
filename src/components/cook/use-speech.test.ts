import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSpeech } from "./use-speech";

class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  constructor(text: string) {
    this.text = text;
  }
}

describe("useSpeech (#436)", () => {
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
    const { result } = renderHook(() => useSpeech());
    expect(result.current.supported).toBe(true);
    expect(result.current.enabled).toBe(false);
  });

  it("speak() cancels any prior utterance, then speaks trimmed text", () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak("  Brown the sausage.  "));
    expect(cancelSpy).toHaveBeenCalled();
    expect(speakSpy).toHaveBeenCalledTimes(1);
    const utterance = speakSpy.mock.calls[0]![0] as FakeUtterance;
    expect(utterance.text).toBe("Brown the sausage.");
  });

  it("speak() ignores empty / whitespace-only text", () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak("   "));
    expect(speakSpy).not.toHaveBeenCalled();
  });

  it("toggling read-aloud off cancels in-progress speech", () => {
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);

    cancelSpy.mockClear();
    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("cancels on unmount (leaving Cook Mode)", () => {
    const { unmount } = renderHook(() => useSpeech());
    cancelSpy.mockClear();
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("is unsupported and inert when the API is missing", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("speechSynthesis", undefined);
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    const { result } = renderHook(() => useSpeech());
    expect(result.current.supported).toBe(false);
    // Must not throw when the API is absent.
    expect(() => act(() => result.current.speak("hello"))).not.toThrow();
  });
});
