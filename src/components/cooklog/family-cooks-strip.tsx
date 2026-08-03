import Image from "next/image";
import { Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { FamilyCookItem } from "~/server/cooklog/queries";
import { formatRelativeTime } from "~/lib/dates";

/**
 * "Made by your family" photo strip (#352): shared cooks of this recipe from
 * members of the viewer's family group. Only rendered when there is at least
 * one shared cook, so it stays out of the way for solo/private recipes.
 */
export async function FamilyCooksStrip({ cooks }: { cooks: FamilyCookItem[] }) {
  if (cooks.length === 0) return null;
  const t = await getTranslations("cookLog.familyCooks");

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-token sm:p-6"
      aria-label={t("a11y.section")}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">
            {t("heading")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </div>

      <ul className="flex gap-4 overflow-x-auto pb-1">
        {cooks.map((cook) => {
          const name = cook.cook?.name ?? cook.cook?.handle ?? t("familyCook");
          return (
            <li key={cook.id} className="w-40 shrink-0">
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {cook.photoUrl ? (
                  <Image
                    src={cook.photoUrl}
                    alt={t("photoAlt", { name })}
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <Users className="size-8" aria-hidden="true" />
                  </div>
                )}
              </div>
              <p className="mt-2 truncate text-sm font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(cook.cookedAt)}
              </p>
              {cook.note && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {cook.note}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
