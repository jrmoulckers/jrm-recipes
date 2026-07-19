"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  DEFAULT_MOBILE_PINNED,
  MAX_PINNED,
  isPinnableKey,
  normalizePinned,
  type NavKey,
} from "~/config/nav";

/**
 * Device-scoped preference for the customizable mobile bottom bar (the 5th slot
 * is always Profile, so this only tracks the up-to-{@link MAX_PINNED} pinned
 * destinations). Persisted to localStorage, mirroring the offline shopping
 * list store, so anonymous / dev-bypass users get a working, remembered bar
 * without a database round-trip. A future account sync can hydrate this store
 * from a server value without changing any consumer.
 */
type BottomNavStore = {
  /** Ordered pinned destination keys (the bar order, left to right). */
  pinned: NavKey[];
  /** Whether the persisted value has rehydrated (SSR-safe rendering guard). */
  hydrated: boolean;
  /** Mark the store as rehydrated (called once by persist middleware). */
  markHydrated: () => void;
  /** Pin a destination (no-op when already pinned or at the cap). */
  pin: (key: NavKey) => void;
  /** Unpin a destination. */
  unpin: (key: NavKey) => void;
  /** Toggle a destination's pinned state. */
  toggle: (key: NavKey) => void;
  /** Move a pinned destination one slot earlier. */
  moveUp: (key: NavKey) => void;
  /** Move a pinned destination one slot later. */
  moveDown: (key: NavKey) => void;
  /** Restore the out-of-the-box defaults. */
  reset: () => void;
};

function move(list: NavKey[], key: NavKey, delta: number): NavKey[] {
  const index = list.indexOf(key);
  if (index === -1) return list;
  const next = index + delta;
  if (next < 0 || next >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[next]] = [copy[next]!, copy[index]!];
  return copy;
}

export const useBottomNavStore = create<BottomNavStore>()(
  persist(
    (set) => ({
      pinned: [...DEFAULT_MOBILE_PINNED],
      hydrated: false,
      markHydrated: () => set({ hydrated: true }),
      pin: (key) =>
        set((state) => {
          if (
            !isPinnableKey(key) ||
            state.pinned.includes(key) ||
            state.pinned.length >= MAX_PINNED
          ) {
            return state;
          }
          return { pinned: [...state.pinned, key] };
        }),
      unpin: (key) =>
        set((state) => ({ pinned: state.pinned.filter((k) => k !== key) })),
      toggle: (key) =>
        set((state) => {
          if (state.pinned.includes(key)) {
            return { pinned: state.pinned.filter((k) => k !== key) };
          }
          if (!isPinnableKey(key) || state.pinned.length >= MAX_PINNED) {
            return state;
          }
          return { pinned: [...state.pinned, key] };
        }),
      moveUp: (key) =>
        set((state) => ({ pinned: move(state.pinned, key, -1) })),
      moveDown: (key) =>
        set((state) => ({ pinned: move(state.pinned, key, 1) })),
      reset: () => set({ pinned: [...DEFAULT_MOBILE_PINNED] }),
    }),
    {
      name: "heirloom-bottom-nav",
      partialize: (state) => ({ pinned: state.pinned }),
      // Drop any stale/invalid keys persisted from an older nav config.
      merge: (persisted, current) => {
        const saved = (persisted as { pinned?: unknown } | undefined)?.pinned;
        const pinned = Array.isArray(saved)
          ? normalizePinned(
              saved.filter((k): k is string => typeof k === "string"),
            )
          : current.pinned;
        return { ...current, pinned };
      },
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
