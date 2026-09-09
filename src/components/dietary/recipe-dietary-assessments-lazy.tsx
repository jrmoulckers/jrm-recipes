'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

import type { RecipeDietaryAssessments as RecipeDietaryAssessmentsComponent } from './recipe-dietary-assessments';

const RecipeDietaryAssessmentsImpl = dynamic(
  () => import('./recipe-dietary-assessments').then((mod) => mod.RecipeDietaryAssessments),
  { ssr: false },
);

type RecipeDietaryAssessmentsProps = ComponentProps<typeof RecipeDietaryAssessmentsComponent>;

export function RecipeDietaryAssessments(props: RecipeDietaryAssessmentsProps) {
  return <RecipeDietaryAssessmentsImpl {...props} />;
}
