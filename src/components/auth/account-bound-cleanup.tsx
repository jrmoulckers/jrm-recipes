'use client';

import * as React from 'react';
import { useAuth } from '@clerk/nextjs';

import {
  cleanupAccountBoundClientData,
  createAccountBoundCleanupCoordinator,
} from '~/lib/account-bound-cleanup';

function ClerkAccountBoundCleanup({ cleanup }: { cleanup: () => void | Promise<void> }) {
  const { isLoaded, userId } = useAuth();
  const [coordinator] = React.useState(() => createAccountBoundCleanupCoordinator(cleanup));

  React.useEffect(() => {
    if (!isLoaded) return;
    void coordinator.observe(userId ?? null);
  }, [coordinator, isLoaded, userId]);

  return null;
}

/**
 * Watches Clerk's live identity at the shared provider boundary. Keeping the
 * Clerk hook in the enabled branch preserves local mode without a ClerkProvider.
 */
export function AccountBoundCleanup({
  enabled,
  cleanup = cleanupAccountBoundClientData,
}: {
  enabled: boolean;
  cleanup?: () => void | Promise<void>;
}) {
  return enabled ? <ClerkAccountBoundCleanup cleanup={cleanup} /> : null;
}
