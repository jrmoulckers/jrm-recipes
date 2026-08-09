import { type Metadata } from "next";
import { Ruler } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser, isAuthConfigured } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { getUnitSettings } from "~/server/units/queries";
import {
  UnitPreferencesManager,
  type CustomUnitView,
  type UnitPreferencesView,
} from "~/components/settings/unit-preferences-manager";
import { type CustomUnitDimension } from "~/server/units/validation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("unitSettings.title") };
}

export default async function UnitsSettingsPage() {
  const user = await getCurrentUser();
  const authConfigured = isAuthConfigured();
  const dbConfigured = isDbConfigured();
  const t = await getTranslations("settings.unitsPage");

  if (authConfigured && dbConfigured && !user) return <SignInNudge />;

  const settings =
    user && dbConfigured
      ? await getUnitSettings(user.id)
      : { preferences: null, customUnits: [] };

  const preferences: UnitPreferencesView | null = settings.preferences
    ? {
        defaultSystem: settings.preferences.defaultSystem,
        volumeUnit: settings.preferences.volumeUnit,
        liquidVolumeUnit: settings.preferences.liquidVolumeUnit,
        dryVolumeUnit: settings.preferences.dryVolumeUnit,
        smallVolumeUnit: settings.preferences.smallVolumeUnit,
        massUnit: settings.preferences.massUnit,
        temperatureUnit: settings.preferences.temperatureUnit,
        autoConvert: settings.preferences.autoConvert,
        packageRounding: settings.preferences.packageRounding,
      }
    : null;

  const customUnits: CustomUnitView[] = settings.customUnits.map((u) => ({
    id: u.id,
    name: u.name,
    abbreviation: u.abbreviation,
    dimension: u.dimension as CustomUnitDimension,
    baseUnit: u.baseUnit,
    baseAmount: u.baseAmount,
    displayAsTrue: u.displayAsTrue,
  }));

  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("description")}</p>
      </header>

      <UnitPreferencesManager
        preferences={preferences}
        customUnits={customUnits}
        offline={!dbConfigured}
      />
    </div>
  );
}

async function SignInNudge() {
  const t = await getTranslations("settings.unitsPage.signIn");
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center shadow-token">
        <span className="bg-primary/12 inline-flex size-16 items-center justify-center rounded-2xl text-primary">
          <Ruler className="size-7" aria-hidden="true" />
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
