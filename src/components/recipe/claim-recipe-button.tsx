'use client';

import { Hand } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { Button } from '~/components/ui/button';
import { useConfirm } from '~/components/ui/confirm-dialog';
import { useServerAction } from '~/lib/use-server-action';
import { claimRecipeAction } from '~/server/recipes/creators-actions';

export function ClaimRecipeButton({ recipeId }: { recipeId: string }) {
  const t = useTranslations('recipeCreators.claim');
  const router = useRouter();
  const confirm = useConfirm();
  const claim = useServerAction(claimRecipeAction, {
    successToast: t('toast'),
    errorToast: true,
    onSuccess: (result) => router.replace(result.path),
  });

  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      disabled={claim.pending}
      onClick={async () => {
        const accepted = await confirm({
          title: t('confirm.title'),
          description: t('confirm.description'),
          confirmLabel: t('confirm.confirmLabel'),
        });
        if (accepted) claim.run({ recipeId });
      }}
    >
      <Hand />
      {claim.pending ? t('pending') : t('action')}
    </Button>
  );
}
