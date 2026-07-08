"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The family member a cook is currently viewing recipes "for". Kept in one
 * small persisted store so calorie-goal, safe-for, and allergen features all
 * react to the same selection instead of each holding a private copy.
 *
 * Only the id is stored — the member's actual data (name, allergens, calorie
 * goal) is always sourced fresh from the server, so a rename or edit can never
 * leave a stale copy behind. Consumers resolve the id against a server-provided
 * list and fall back gracefully when it matches nothing (e.g. a different user,
 * or a profile that was deleted).
 */
type ActiveMemberStore = {
  activeMemberId: string | null;
  setActiveMemberId: (id: string | null) => void;
};

export const useActiveMemberStore = create<ActiveMemberStore>()(
  persist(
    (set) => ({
      activeMemberId: null,
      setActiveMemberId: (id) => set({ activeMemberId: id }),
    }),
    { name: "heirloom-active-member" },
  ),
);
