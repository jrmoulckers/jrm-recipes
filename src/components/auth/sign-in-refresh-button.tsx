'use client';

import { useEffect, type ReactNode } from 'react';
import { SignInButton, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

import { Button } from '~/components/ui/button';

export function SignInRefreshButton({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (isLoaded && userId) router.refresh();
  }, [isLoaded, userId, router]);

  return (
    <SignInButton mode="modal">
      <Button type="button" disabled={!isLoaded}>
        {children}
      </Button>
    </SignInButton>
  );
}
