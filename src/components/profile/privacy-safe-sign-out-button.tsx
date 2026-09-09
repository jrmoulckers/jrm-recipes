'use client';

import { useClerk } from '@clerk/nextjs';
import { LogOut } from 'lucide-react';
import { useState } from 'react';

import { reset } from '~/lib/analytics';
import { clearDietaryModelData } from '~/lib/dietary-model-storage';
import { stopDietaryAnalysisWorker } from '~/lib/dietary-on-device';
import { Button } from '~/components/ui/button';

export function PrivacySafeSignOutButton({ children }: { children: React.ReactNode }) {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    stopDietaryAnalysisWorker();
    await clearDietaryModelData();
    reset();
    await signOut({ redirectUrl: '/' });
  }

  return (
    <Button
      variant="ghost"
      className="w-full justify-start gap-3"
      disabled={pending}
      onClick={() => void handleSignOut()}
    >
      <LogOut className="size-4" aria-hidden="true" />
      {children}
    </Button>
  );
}
