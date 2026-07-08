/**
 * Pure helpers for Cook Mode background notifications (#186). The DOM-touching
 * bits (requesting permission, calling `registration.showNotification`) live in
 * `use-cook-session.ts`; the decision logic and payload/URL shaping live here so
 * they're unit-testable and can be shared with the service worker's
 * `notificationclick` handler (which imports `matchesCookClient`).
 */

export const COOK_NOTIFICATION_TAG_PREFIX = "heirloom-cook-timer";
export const COOK_NOTIFICATION_TYPE = "cook-timer";

/** Cook Mode route for a recipe, used as the notification's focus target. */
export function cookTimerNotificationUrl(recipeSlug: string): string {
  return `/recipes/${recipeSlug}/cook`;
}

export type CookTimerNotification = {
  title: string;
  options: NotificationOptions & {
    // `renotify` isn't in this TS DOM lib's NotificationOptions yet, but is
    // supported at runtime and lets a re-run replace the prior timer alert.
    renotify?: boolean;
    data: { url: string; type: typeof COOK_NOTIFICATION_TYPE };
  };
};

/**
 * Build the title/options for a completed-timer system notification. Names the
 * step (title) and recipe (body), tags per step so a re-run replaces rather
 * than stacks, and carries the Cook Mode URL in `data` for `notificationclick`.
 */
export function buildCookTimerNotification(input: {
  stepNumber: number;
  section: string | null;
  recipeTitle: string;
  recipeSlug: string;
  stepId: string;
}): CookTimerNotification {
  const url = cookTimerNotificationUrl(input.recipeSlug);
  const body = input.section
    ? `${input.recipeTitle} · ${input.section}`
    : input.recipeTitle;
  return {
    title: `Step ${input.stepNumber} timer is done`,
    options: {
      body,
      tag: `${COOK_NOTIFICATION_TAG_PREFIX}:${input.recipeSlug}:${input.stepId}`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      renotify: true,
      requireInteraction: false,
      data: { url, type: COOK_NOTIFICATION_TYPE },
    },
  };
}

/**
 * Whether to fire a *system* notification for a completed timer. We only do so
 * when notifications are supported and granted AND the tab is hidden — in the
 * foreground the existing tone + toast already alert the cook, so a tray
 * notification would be redundant.
 */
export function shouldSendTimerNotification(opts: {
  supported: boolean;
  permission: NotificationPermission;
  documentHidden: boolean;
}): boolean {
  return opts.supported && opts.permission === "granted" && opts.documentHidden;
}

/**
 * Best-effort permission request, safe to call from a user gesture (e.g.
 * starting a timer). Returns the resulting permission and never throws. Only
 * prompts when still `default`, so a prior grant/denial is respected.
 */
export async function requestTimerNotificationPermission(
  notification:
    | {
        permission: NotificationPermission;
        requestPermission: () => Promise<NotificationPermission>;
      }
    | undefined,
): Promise<NotificationPermission> {
  if (!notification) return "denied";
  if (notification.permission !== "default") return notification.permission;
  try {
    return await notification.requestPermission();
  } catch {
    return notification.permission;
  }
}

/**
 * Whether an open window client should be focused for a cook-timer notification
 * click, by comparing pathnames (query/hash ignored). Used by the SW's
 * `notificationclick` handler to focus an existing Cook Mode tab instead of
 * opening a duplicate.
 */
export function matchesCookClient(
  clientUrl: string,
  targetUrl: string,
): boolean {
  try {
    return new URL(clientUrl).pathname === new URL(targetUrl).pathname;
  } catch {
    return false;
  }
}
