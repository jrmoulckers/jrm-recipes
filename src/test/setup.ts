import "@testing-library/jest-dom/vitest";

// jsdom does not implement ResizeObserver, but several Radix primitives measure
// themselves with it (Checkbox/Switch bubble inputs, Slider thumb, Tooltip
// arrow, …). Provide a no-op polyfill globally so any component that renders one
// of these primitives works under the test environment without each test file
// re-stubbing it. Individual files may still override this with `??=`.
globalThis.ResizeObserver ??= class {
  observe() {
    // no-op: element measurements are irrelevant in jsdom
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
} as unknown as typeof ResizeObserver;
