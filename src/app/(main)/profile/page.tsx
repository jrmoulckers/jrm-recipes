import { type Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { getAuthState } from "~/server/auth";
import { ProfileHub } from "~/components/profile/profile-hub";
import { withRouteMessages } from "~/components/i18n/route-messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile");
  return { title: t("title") };
}

async function ProfilePage() {
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

export default withRouteMessages(ProfilePage);
