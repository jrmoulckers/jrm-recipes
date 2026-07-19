import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getAuthState } from "~/server/auth";
import { ProfileHub } from "~/components/profile/profile-hub";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile");
  return { title: t("title") };
}

export default async function ProfilePage() {
  const { isConfigured, user } = await getAuthState();

  return (
    <ProfileHub
      isConfigured={isConfigured}
      user={
        user
          ? { name: user.name, email: user.email, avatarUrl: user.avatarUrl }
          : null
      }
    />
  );
}
