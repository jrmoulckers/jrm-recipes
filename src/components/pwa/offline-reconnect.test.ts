import { describe, expect, it, vi } from "vitest";

import { RECONNECT_DELAY_MS, scheduleReconnect } from "./offline-reconnect";

describe("scheduleReconnect", () => {
  it("schedules a reload and reports retrying when online", () => {
    const onRetrying = vi.fn();
    const reload = vi.fn();
    const setTimer = vi.fn<(cb: () => void, ms: number) => number>(() => 42);

    const id = scheduleReconnect(true, { onRetrying, reload, setTimer });

    expect(onRetrying).toHaveBeenCalledOnce();
    expect(setTimer).toHaveBeenCalledWith(reload, RECONNECT_DELAY_MS);
    expect(id).toBe(42);
  });

  it("schedules nothing when offline", () => {
    const onRetrying = vi.fn();
    const reload = vi.fn();
    const setTimer = vi.fn();

    const id = scheduleReconnect(false, { onRetrying, reload, setTimer });

    expect(id).toBeUndefined();
    expect(onRetrying).not.toHaveBeenCalled();
    expect(setTimer).not.toHaveBeenCalled();
  });

  it("honors a custom delay", () => {
    const setTimer = vi.fn<(cb: () => void, ms: number) => number>(() => 1);

    scheduleReconnect(
      true,
      { onRetrying: () => undefined, reload: () => undefined, setTimer },
      1200,
    );

    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 1200);
  });
});
