'use client';

import * as React from 'react';
import { useAuth } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  type AccountBoundOwnerMarkerStore,
  type AccountIdentityMarker,
  cleanupAccountBoundClientData,
  createAccountBoundCleanupCoordinator,
} from '~/lib/account-bound-cleanup';

function ClerkAccountBoundCleanup({
  cleanup,
  ownerMarkerStore,
  markerForIdentity,
}: {
  cleanup: () => unknown | Promise<unknown>;
  ownerMarkerStore?: AccountBoundOwnerMarkerStore;
  markerForIdentity?: AccountIdentityMarker;
}) {
  const { isLoaded, userId } = useAuth();
  const t = useTranslations('auth');
  const [coordinator] = React.useState(() =>
    createAccountBoundCleanupCoordinator(cleanup, ownerMarkerStore, markerForIdentity),
  );

  React.useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let warned = false;

    const observe = async () => {
      const cleaned = await coordinator.observe(userId ?? null);
      if (cleaned || cancelled) return;
      if (!warned) {
        warned = true;
        toast.warning(t('accountCleanupFailed'));
      }
      retry = setTimeout(() => void observe(), 1_000);
    };

    void observe();
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
  }, [coordinator, isLoaded, t, userId]);

  return null;
}

/**
 * Watches Clerk's live identity at the shared provider boundary. Keeping the
 * Clerk hook in the enabled branch preserves local mode without a ClerkProvider.
 */
export function AccountBoundCleanup({
  enabled,
  cleanup = cleanupAccountBoundClientData,
  ownerMarkerStore,
  markerForIdentity,
}: {
  enabled: boolean;
  cleanup?: () => unknown | Promise<unknown>;
  ownerMarkerStore?: AccountBoundOwnerMarkerStore;
  markerForIdentity?: AccountIdentityMarker;
}) {
  return enabled ? (
    <ClerkAccountBoundCleanup
      cleanup={cleanup}
      ownerMarkerStore={ownerMarkerStore}
      markerForIdentity={markerForIdentity}
    />
  ) : null;
}
