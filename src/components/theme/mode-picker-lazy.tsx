'use client';

import dynamic from 'next/dynamic';

const ModePickerImpl = dynamic(
  () => import('~/components/theme/mode-picker').then((module) => module.ModePicker),
  { ssr: false },
);

export function ModePickerLazy() {
  return <ModePickerImpl />;
}
