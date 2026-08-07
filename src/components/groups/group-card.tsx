import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";

import { CloudinaryImage } from "~/components/ui/cloudinary-image";
import { type MyGroup } from "~/server/groups/queries";
import { RoleBadge } from "./role-badge";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export async function GroupCard({ group }: { group: MyGroup }) {
  const t = await getTranslations("groups.card");

  return (
    <Link
      href={`/groups/${group.slug}`}
      className="group flex min-h-56 flex-col rounded-2xl border border-border bg-card p-5 shadow-token transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-token-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="bg-primary/12 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border font-display text-lg font-bold text-primary">
          {/* Decorative: the avatar repeats the group name shown beside it. */}
          {group.avatarUrl ? (
            <CloudinaryImage
              src={group.avatarUrl}
              alt=""
              width={56}
              height={56}
              className="size-full object-cover"
            />
          ) : (
            initials(group.name)
          )}
        </div>
        <RoleBadge role={group.role} label={t(`roles.${group.role}`)} />
      </div>

      <div className="mt-5 flex flex-1 flex-col gap-2">
        <h2 className="font-display text-xl font-bold leading-tight tracking-tight">
          {group.name}
        </h2>
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
          {group.description ?? t("defaultDescription")}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4" aria-hidden="true" />
          {t("memberCount", { count: group.memberCount })}
        </span>
        <span>{t("recipeCount", { count: group.recipeCount })}</span>
      </div>
    </Link>
  );
}
