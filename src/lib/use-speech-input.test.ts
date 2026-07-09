import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appendDictation, useSpeechInput } from "./use-speech-input";

type ResultRow = { isFinal: boolean; 0: { transcript: string } };

class FakeRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult:
    | ((event: { resultIndex: number; results: Record<number, ResultRow> & { length: number } }) => void)
    | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();

  emit(transcript: string) {
    this.onresult?.({
      resultIndex: 0,
      results: { 0: { isFinal: true, 0: { transcript } }, length: 1 },
    });
  }
}

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  vi.restoreAllMocks();
});

describe("appendDictation", () => {
  it("appends with a separating space and never wipes existing text", () => {
    expect(appendDictation("", "hello")).toBe("hello");
    expect(appendDictation("Chop the", "onions")).toBe("Chop the onions");
    expect(appendDictation("Chop the ", "onions")).toBe("Chop the onions");
    expect(appendDictation("keep", "   ")).toBe("keep");
  });
});

describe("useSpeechInput (#373)", () => {
  it("reports unsupported when the API is absent", () => {
    const { result } = renderHook(() =>
      useSpeechInput({ onResult: vi.fn() }),
    );
    expect(result.current.supported).toBe(false);
  });

  it("starts, transcribes final results, and stops", () => {
    let instance: FakeRecognition | null = null;
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      function () {
        instance = new FakeRecognition();
        return instance;
      };

    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechInput({ onResult }));

    expect(result.current.supported).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.listening).toBe(true);
    expect(instance!.start).toHaveBeenCalled();

    act(() => instance!.emit("chicken and dumplings"));
    expect(onResult).toHaveBeenCalledWith("chicken and dumplings");

    act(() => result.current.toggle());
    expect(instance!.stop).toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });
});
