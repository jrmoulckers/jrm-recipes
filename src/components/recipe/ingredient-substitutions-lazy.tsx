'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

import type { IngredientSubstitutions as IngredientSubstitutionsComponent } from './ingredient-substitutions';

const IngredientSubstitutionsImpl = dynamic(
  () => import('./ingredient-substitutions').then((mod) => mod.IngredientSubstitutions),
  { ssr: false },
);

type IngredientSubstitutionsProps = ComponentProps<typeof IngredientSubstitutionsComponent>;

export function IngredientSubstitutions(props: IngredientSubstitutionsProps) {
  return <IngredientSubstitutionsImpl {...props} />;
}
