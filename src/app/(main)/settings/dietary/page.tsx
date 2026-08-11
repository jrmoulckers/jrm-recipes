import { type Metadata } from "next";
import { type ReactNode } from "react";
import { UtensilsCrossed } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listMemberProfiles } from "~/server/dietary/queries";
import { listMyGroups } from "~/server/groups/queries";
import { ALLERGENS, type Allergen } from "~/lib/allergens";
import { DIETARY_TAGS, type DietaryTag } from "~/lib/substitutions";
import { withRouteMessages } from "~/components/i18n/route-messages";
import {
  DietaryProfilesManager,
  type MemberProfileView,
} from "~/components/dietary/dietary-profiles-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("dietarySettings.title") };
}

const ALLERGEN_SET = new Set<string>(ALLERGENS);
const DIET_SET = new Set<string>(DIETARY_TAGS);

async function DietaryProfilesPage() {
  const user = await getCurrentUser();
  const authConfigured = isAuthConfigured();
  const dbConfigured = isDbConfigured();
  const t = await getTranslations("settings.dietaryPage");

  if (authConfigured && dbConfigured && !user) return <SignInNudge />;

  const [profileRows, groups] = user
    ? await Promise.all([listMemberProfiles(user.id), listMyGroups(user.id)])
    : [[], []];

  const profiles: MemberProfileView[] = profileRows.map((p) => ({
    id: p.id,
    name: p.name,
    allergens: (p.allergens ?? []).filter((a): a is Allergen =>
      ALLERGEN_SET.has(a),
    ),
    diets: (p.diets ?? []).filter((d): d is DietaryTag => DIET_SET.has(d)),
    calorieGoal: p.calorieGoal,
    groupId: p.groupId,
  }));

  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </header>

      {!dbConfigured ? (
        <ConnectDbNotice />
      ) : (
        <DietaryProfilesManager profiles={profiles} groups={groupOptions} />
      )}
    </div>
  );
}

async function SignInNudge() {
  const t = await getTranslations("settings.dietaryPage.signIn");
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <UtensilsCrossed className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("body")}</p>
        </div>
      </div>
    </div>
  );
}

async function ConnectDbNotice() {
  const t = await getTranslations("dbNotice");
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
      <p className="mx-auto max-w-md">
        {t.rich("dietary", {
          code: (chunks: ReactNode) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {chunks}
            </code>
          ),
        })}
      </p>
    </div>
  );
}

export default withRouteMessages(DietaryProfilesPage);
