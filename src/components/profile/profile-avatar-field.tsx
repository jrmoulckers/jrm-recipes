"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { friendlyError } from "~/lib/error-copy";
import { updateAvatarAction } from "~/server/users/actions";
import { ImageUploadField } from "~/components/ui/image-upload";

/**
 * In-app profile photo (issue #659). Until now the avatar could only come from
 * Clerk, which left anyone signed in with a provider that has no picture — or
 * anyone who simply wanted a different one here — with no way to set it.
 *
 * Saving marks the avatar user-managed on the server, so the next Clerk
 * `user.updated` sync no longer overwrites it. Clearing the photo hands the
 * column back to Clerk.
 */
export function ProfileAvatarField({
  avatarUrl,
}: {
  avatarUrl: string | null;
}) {
  const t = useTranslations("profile.avatar");
  const router = useRouter();
  const [value, setValue] = React.useState(avatarUrl ?? "");
  const [isPending, startTransition] = React.useTransition();

  function save(next: string) {
    const previous = value;
    setValue(next);
    startTransition(() => {
      void updateAvatarAction(next).then((result) => {
        if (!result.ok) {
          // Put the old photo back rather than leaving the UI claiming a change
          // the server refused.
          setValue(previous);
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(next ? t("saved") : t("cleared"));
        router.refresh();
      });
    });
  }

  return (
    <div aria-busy={isPending}>
      <ImageUploadField
        label={t("label")}
        hint={t("hint")}
        value={value}
        onChange={save}
        folder="heirloom/avatars"
        size="compact"
      />
    </div>
  );
}
