'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

import type { IngredientEvidenceReview as IngredientEvidenceReviewComponent } from './ingredient-evidence-control';

const IngredientEvidenceReviewImpl = dynamic(() =>
  import('./ingredient-evidence-control').then((mod) => mod.IngredientEvidenceReview),
);

type IngredientEvidenceReviewProps = ComponentProps<typeof IngredientEvidenceReviewComponent>;

export type { IngredientDietaryEvidence } from './ingredient-evidence-control';

export function IngredientEvidenceReview(props: IngredientEvidenceReviewProps) {
  return <IngredientEvidenceReviewImpl {...props} />;
}
