import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HOUSEHOLD_COOKIE } from "~/config/household";
import {
  HouseholdProvider,
  useHousehold,
} from "./household-provider";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.cookie = `${HOUSEHOLD_COOKIE}=;path=/;max-age=0`;
});

function wrapper(initialSize: number | null) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <HouseholdProvider initialSize={initialSize}>
        {children}
      </HouseholdProvider>
    );
  };
}

describe("useHousehold", () => {
  it("defaults to null (unchanged behavior) with no preference", () => {
    const { result } = renderHook(() => useHousehold(), {
      wrapper: wrapper(null),
    });
    expect(result.current.size).toBeNull();
  });

  it("hydrates from the SSR initial size", () => {
    const { result } = renderHook(() => useHousehold(), {
      wrapper: wrapper(5),
    });
    expect(result.current.size).toBe(5);
  });

  it("sets, clamps, and persists the household size to a cookie", () => {
    const { result } = renderHook(() => useHousehold(), {
      wrapper: wrapper(null),
    });

    act(() => result.current.setSize(6));
    expect(result.current.size).toBe(6);
    expect(document.cookie).toContain(`${HOUSEHOLD_COOKIE}=6`);

    act(() => result.current.setSize(999));
    expect(result.current.size).toBe(20);
  });

  it("clears back to no preference", () => {
    const { result } = renderHook(() => useHousehold(), {
      wrapper: wrapper(4),
    });

    act(() => result.current.clear());
    expect(result.current.size).toBeNull();
  });

  it("returns a safe default when used outside the provider", () => {
    const { result } = renderHook(() => useHousehold());
    expect(result.current.size).toBeNull();
    expect(() => result.current.setSize(3)).not.toThrow();
  });
});
