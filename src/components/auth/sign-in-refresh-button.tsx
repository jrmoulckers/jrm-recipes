'use client';

import { useEffect, type ReactNode } from 'react';
import { SignInButton, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

import { Button, type ButtonProps } from '~/components/ui/button';

export function SignInRefreshButton({
  children,
  className,
  title,
}: { children: ReactNode } & Pick<ButtonProps, 'className' | 'title'>) {
  const router = useRouter();
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (isLoaded && userId) router.refresh();
  }, [isLoaded, userId, router]);

  return (
    <SignInButton mode="modal">
      <Button type="button" disabled={!isLoaded} className={className} title={title}>
        {children}
      </Button>
    </SignInButton>
  );
}
