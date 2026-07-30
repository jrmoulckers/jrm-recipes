"use client";

import * as React from "react";
import { UserCheck, UserPlus } from "lucide-react";

import {
  followUserAction,
  unfollowUserAction,
} from "~/server/follows/actions";
import { Button } from "~/components/ui/button";
import { useServerAction } from "~/lib/use-server-action";

/**
 * Follow / Unfollow toggle for a public profile. Optimistic: flips immediately
 * and rolls back on failure. Only rendered when the profile owner has opted in
 * to a public profile, so there is no follow affordance otherwise.
 */
export function FollowButton({
  followeeId,
  initialFollowing,
  className,
}: {
  followeeId: string;
  initialFollowing: boolean;
  className?: string;
}) {
  const [following, setFollowing] = React.useState(initialFollowing);

  const follow = useServerAction(followUserAction, {
    errorToast: true,
    successToast: "You're now following this cook.",
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
      variant={following ? "outline" : "default"}
      disabled={pending}
      onClick={toggle}
      className={className}
      aria-pressed={following}
    >
      {following ? (
        <>
          <UserCheck /> Following
        </>
      ) : (
        <>
          <UserPlus /> Follow
        </>
      )}
    </Button>
  );
}
