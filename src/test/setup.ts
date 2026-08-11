import '@testing-library/jest-dom/vitest';

import { configure } from '@testing-library/react';

// Testing Library's `findBy*`/`waitFor` budget is separate from vitest's
// `testTimeout` and defaults to 1000ms. Nothing configured it, so every async
// query in the suite ran on that default while the test around it had 5000ms.
//
// Measured on `recipe-editor.a11y.test.tsx` (#854), time from submit click to
// the error summary's `role="alert"`:
//
//   isolated file           85ms
//   full suite, 3 runs      348ms / 288ms / 253ms
//
// Contention inflates it ~4x, so the worst observation already consumed 35% of
// the default budget. That is the margin, and it shrinks as the suite grows.
//
// The failure mode is what makes this worth fixing rather than tolerating: when
// the budget expires, the query reports `Unable to find role="alert"` — the same
// message a genuinely missing error summary produces. A contention artefact is
// then indistinguishable from the accessibility regression the test exists to
// catch, so the honest response to it looks identical to the wrong one.
//
// Keep this strictly below vitest's `testTimeout`. If the async budget outlives
// the test budget, the query never gets to report *what* it could not find and
// the failure degrades to a bare timeout with no DOM dump. `setup.test.ts` pins
// both the value and that ordering.
configure({ asyncUtilTimeout: 3000 });

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
