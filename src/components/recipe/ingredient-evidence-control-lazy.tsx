'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

import type { IngredientEvidenceControl as IngredientEvidenceControlComponent } from './ingredient-evidence-control';

const IngredientEvidenceControlImpl = dynamic(() =>
  import('./ingredient-evidence-control').then((mod) => mod.IngredientEvidenceControl),
);

type IngredientEvidenceControlProps = ComponentProps<typeof IngredientEvidenceControlComponent>;

export type { IngredientDietaryEvidence } from './ingredient-evidence-control';

export function IngredientEvidenceControl(props: IngredientEvidenceControlProps) {
  return <IngredientEvidenceControlImpl {...props} />;
}
