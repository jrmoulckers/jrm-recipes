"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { leaveRecipeAsCreatorAction } from "~/server/recipes/creators-actions";
import { useServerAction } from "~/lib/use-server-action";
import { useConfirm } from "~/components/ui/confirm-dialog";
import { Button } from "~/components/ui/button";

/**
 * Lets an accepted co-creator step down from a recipe (issue #668).
 *
 * The counterpart to the owner's Delete: removal is otherwise entirely in the
 * owner's hands, so without this a co-creator has no way to end their own
 * attachment to someone else's recipe — and that attachment is public, since
 * the recipe answers under their namespace and their name sits in its byline.
 *
 * The confirmation names both consequences (access and the link) rather than
 * asking a bare "are you sure", because leaving is a real revocation: the slug
 * is freed immediately and no alias is left behind.
 *
 * On success the viewer is sent to their library instead of refreshed in place.
 * They have just revoked their own access, so re-rendering the recipe would
 * either 404 or, for a public recipe, silently drop them into a stranger's view.
 */
export function LeaveRecipeButton({ recipeId }: { recipeId: string }) {
  const t = useTranslations("recipeCreators.leave");
  const router = useRouter();
  const confirm = useConfirm();
  const leave = useServerAction(leaveRecipeAsCreatorAction, {
    successToast: t("toast"),
    errorToast: true,
    onSuccess: () => router.push("/recipes"),
  });

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      disabled={leave.pending}
      onClick={async () => {
        const ok = await confirm({
          title: t("confirm.title"),
          description: t("confirm.description"),
          confirmLabel: t("confirm.confirmLabel"),
        });
        if (!ok) return;
        leave.run({ recipeId });
      }}
    >
      <LogOut />
      {leave.pending ? t("pending") : t("action")}
    </Button>
  );
}
