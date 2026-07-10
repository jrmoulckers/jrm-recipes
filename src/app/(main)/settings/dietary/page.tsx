import { type Metadata } from "next";
import { UtensilsCrossed } from "lucide-react";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { listMemberProfiles } from "~/server/dietary/queries";
import { listMyGroups } from "~/server/groups/queries";
import { ALLERGENS, type Allergen } from "~/lib/allergens";
import { DIETARY_TAGS, type DietaryTag } from "~/lib/substitutions";
import {
  DietaryProfilesManager,
  type MemberProfileView,
} from "~/components/dietary/dietary-profiles-manager";

export const metadata: Metadata = { title: "Dietary profiles" };

const ALLERGEN_SET = new Set<string>(ALLERGENS);
const DIET_SET = new Set<string>(DIETARY_TAGS);

export default async function DietaryProfilesPage() {
  const user = await getCurrentUser();
  const authConfigured = isAuthConfigured();
  const dbConfigured = isDbConfigured();

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
          Dietary profiles
        </h1>
        <p className="mt-1 text-muted-foreground">
          Your family isn&apos;t one diet. Record each person&apos;s allergies,
          diets, and calorie goals once, and Heirloom can help you cook safely
          for everyone.
        </p>
      </header>

      {!dbConfigured ? (
        <ConnectDbNotice />
      ) : (
        <DietaryProfilesManager profiles={profiles} groups={groupOptions} />
      )}
    </div>
  );
}

function SignInNudge() {
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <UtensilsCrossed className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Dietary profiles are private
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in from the header to record who you cook for.
          </p>
        </div>
      </div>
    </div>
  );
}

function ConnectDbNotice() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center text-muted-foreground">
      <p className="mx-auto max-w-md">
        Connect a database to start saving dietary profiles. Set{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          DATABASE_URL
        </code>{" "}
        or start the local Postgres container.
      </p>
    </div>
  );
}
