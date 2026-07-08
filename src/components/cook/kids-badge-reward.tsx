"use client";

import * as React from "react";

import { readBadges, type KidBadge } from "./kids-rewards";

/**
 * Reward UI shown inside the completion moment in Kids mode (#413): reveals the
 * badge(s) just earned and offers a "My badges" shelf listing the whole
 * collection (read from localStorage) so a young chef can look back at everything
 * they've made.
 */
export function KidsBadgeReward({
  newlyEarned,
}: {
  newlyEarned: KidBadge[];
}) {
  const [allBadges, setAllBadges] = React.useState<KidBadge[]>([]);
  const [showShelf, setShowShelf] = React.useState(false);

  React.useEffect(() => {
    setAllBadges(readBadges());
  }, []);

  return (
    <div className="mt-6">
      {newlyEarned.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-warning-foreground">
            {newlyEarned.length > 1 ? "New badges earned!" : "New badge earned!"}
          </p>
          <ul className="mt-3 flex flex-wrap justify-center gap-4">
            {newlyEarned.map((badge) => (
              <li
                key={badge.id}
                className="flex w-24 flex-col items-center gap-1"
              >
                <span
                  className="text-5xl motion-safe:animate-fade-in"
                  aria-hidden="true"
                >
                  {badge.emoji}
                </span>
                <span className="text-center text-xs font-semibold">
                  {badge.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {allBadges.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowShelf((open) => !open)}
            aria-expanded={showShelf}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {showShelf ? "Hide my badges" : `My badges (${allBadges.length})`}
          </button>
          {showShelf && (
            <ul className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5">
              {allBadges.map((badge) => (
                <li
                  key={badge.id}
                  className="flex flex-col items-center gap-1"
                >
                  <span className="text-3xl" aria-hidden="true">
                    {badge.emoji}
                  </span>
                  <span className="line-clamp-2 text-center text-[0.65rem] text-muted-foreground">
                    {badge.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
