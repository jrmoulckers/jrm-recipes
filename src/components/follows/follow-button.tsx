'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { UserCheck, UserPlus } from 'lucide-react';

import { followUserAction, unfollowUserAction } from '~/server/follows/actions';
import { SignInRefreshButton } from '~/components/auth/sign-in-refresh-button';
import { Button } from '~/components/ui/button';
import { useServerAction } from '~/lib/use-server-action';

type FollowButtonProps = {
  followeeId: string;
  initialFollowing: boolean;
  signedIn: boolean;
  authConfigured: boolean;
  className?: string;
};

/**
 * Guests open sign-in without a mutation. Signed-in viewers retain the
 * optimistic toggle. The profile page gates both on the owner's public opt-in.
 */
export function FollowButton(props: FollowButtonProps) {
  const t = useTranslations('follows.button');
  const auth = useTranslations('auth');

  if (!props.signedIn) {
    if (props.authConfigured)
      return (
        <SignInRefreshButton className={props.className} title={auth('signIn')}>
          <UserPlus /> {t('follow')}
        </SignInRefreshButton>
      );
    return (
      <Button type="button" disabled className={props.className} title={auth('signIn')}>
        <UserPlus /> {t('follow')}
      </Button>
    );
  }

  return <AuthenticatedFollowButton {...props} />;
}

function AuthenticatedFollowButton({ followeeId, initialFollowing, className }: FollowButtonProps) {
  const t = useTranslations('follows.button');
  const [following, setFollowing] = React.useState(initialFollowing);

  const follow = useServerAction(followUserAction, {
    errorToast: true,
    successToast: t('toasts.following'),
    onError: () => setFollowing(false),
  });
  const unfollow = useServerAction(unfollowUserAction, {
    errorToast: true,
    onError: () => setFollowing(true),
  });

  const pending = follow.pending || unfollow.pending;

  function toggle() {
    if (following) {
      setFollowing(false);
      unfollow.run({ followeeId });
    } else {
      setFollowing(true);
      follow.run({ followeeId });
    }
  }

  return (
    <Button
      type="button"
      variant={following ? 'outline' : 'default'}
      disabled={pending}
      onClick={toggle}
      className={className}
      aria-pressed={following}
    >
      {following ? (
        <>
          <UserCheck /> {t('following')}
        </>
      ) : (
        <>
          <UserPlus /> {t('follow')}
        </>
      )}
    </Button>
  );
}
