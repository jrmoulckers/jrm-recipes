import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useReadAloud } from "./use-read-aloud";

class FakeUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  onend: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const STEPS = [
  "Step 1. Cream the butter.",
  "Step 2. Add eggs.",
  "Step 3. Bake.",
];

describe("useReadAloud (#387)", () => {
  let speakSpy: ReturnType<typeof vi.fn>;
  let cancelSpy: ReturnType<typeof vi.fn>;
  let pauseSpy: ReturnType<typeof vi.fn>;
  let resumeSpy: ReturnType<typeof vi.fn>;

  function lastUtterance(): FakeUtterance {
    return speakSpy.mock.calls[
      speakSpy.mock.calls.length - 1
    ]![0] as FakeUtterance;
  }

  beforeEach(() => {
    speakSpy = vi.fn();
    cancelSpy = vi.fn();
    pauseSpy = vi.fn();
    resumeSpy = vi.fn();
    vi.stubGlobal("speechSynthesis", {
      speak: speakSpy,
      cancel: cancelSpy,
      pause: pauseSpy,
      resume: resumeSpy,
    });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports supported and starts idle", () => {
    const { result } = renderHook(() => useReadAloud(STEPS));
    expect(result.current.supported).toBe(true);
    expect(result.current.status).toBe("idle");
    expect(result.current.index).toBe(-1);
  });

  it("play() reads the first step and marks it playing", () => {
    const { result } = renderHook(() => useReadAloud(STEPS));
    act(() => result.current.play());
    expect(result.current.status).toBe("playing");
    expect(result.current.index).toBe(0);
    expect(lastUtterance().text).toBe(STEPS[0]);
  });

  it("auto-advances to the next step when one finishes", () => {
    const { result } = renderHook(() => useReadAloud(STEPS));
    act(() => result.current.play());
    act(() => lastUtterance().onend?.());
    expect(result.current.index).toBe(1);
    expect(lastUtterance().text).toBe(STEPS[1]);
  });

  it("returns to idle after the final step finishes", () => {
    const { result } = renderHook(() => useReadAloud(STEPS));
    act(() => result.current.play());
    act(() => lastUtterance().onend?.()); // -> step 1
    act(() => lastUtterance().onend?.()); // -> step 2
    act(() => lastUtterance().onend?.()); // -> done
    expect(result.current.status).toBe("idle");
    expect(result.current.index).toBe(-1);
  });

  it("stop() cancels and invalidates any pending auto-advance", () => {
    const { result } = renderHook(() => useReadAloud(STEPS));
    act(() => result.current.play());
    const utterance = lastUtterance();
    act(() => result.current.stop());
    expect(cancelSpy).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.index).toBe(-1);
    // A late onend from the cancelled utterance must not restart playback.
    const callsBefore = speakSpy.mock.calls.length;
    act(() => utterance.onend?.());
    expect(speakSpy.mock.calls.length).toBe(callsBefore);
    expect(result.current.index).toBe(-1);
  });

  it("pause() then play() uses native pause/resume without re-speaking", () => {
    const { result } = renderHook(() => useReadAloud(STEPS));
    act(() => result.current.play());
    const speakCount = speakSpy.mock.calls.length;
    act(() => result.current.pause());
    expect(pauseSpy).toHaveBeenCalled();
    expect(result.current.status).toBe("paused");
    act(() => result.current.play());
    expect(resumeSpy).toHaveBeenCalled();
    expect(result.current.status).toBe("playing");
    expect(speakSpy.mock.calls.length).toBe(speakCount); // resumed, not restarted
  });

  it("next() and previous() jump between steps", () => {
    const { result } = renderHook(() => useReadAloud(STEPS));
    act(() => result.current.play());
    act(() => result.current.next());
    expect(result.current.index).toBe(1);
    act(() => result.current.next());
    expect(result.current.index).toBe(2);
    act(() => result.current.next()); // clamped at the last step
    expect(result.current.index).toBe(2);
    act(() => result.current.previous());
    expect(result.current.index).toBe(1);
  });

  it("replay() re-reads the current step", () => {
    const { result } = renderHook(() => useReadAloud(STEPS));
    act(() => result.current.play());
    act(() => lastUtterance().onend?.()); // -> step 1
    const count = speakSpy.mock.calls.length;
    act(() => result.current.replay());
    expect(speakSpy.mock.calls.length).toBe(count + 1);
    expect(lastUtterance().text).toBe(STEPS[1]);
    expect(result.current.index).toBe(1);
  });

  it("cancels speech on unmount", () => {
    const { result, unmount } = renderHook(() => useReadAloud(STEPS));
    act(() => result.current.play());
    cancelSpy.mockClear();
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("is unsupported and inert when the API is missing", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("speechSynthesis", undefined);
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    const { result } = renderHook(() => useReadAloud(STEPS));
    expect(result.current.supported).toBe(false);
    expect(() => act(() => result.current.play())).not.toThrow();
  });
});
