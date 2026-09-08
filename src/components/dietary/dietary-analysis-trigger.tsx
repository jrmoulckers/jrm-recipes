'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

export function DietaryAnalysisTrigger({
  accountId,
  recipeId,
}: {
  accountId: string;
  recipeId: string;
}) {
  const router = useRouter();

  React.useEffect(() => {
    let active = true;
    void import('~/lib/dietary-analysis-client')
      .then(({ analyzeRecipeOnDevice }) =>
        analyzeRecipeOnDevice(recipeId, accountId, 'recipe_open'),
      )
      .then((result) => {
        if (active && result === 'completed') router.refresh();
      })
      .catch(() => {
        console.error('Unable to load private dietary analysis.');
      });
    return () => {
      active = false;
    };
  }, [accountId, recipeId, router]);

  return null;
}
