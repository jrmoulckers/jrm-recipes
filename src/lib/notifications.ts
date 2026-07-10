import type { NotificationType } from "~/server/db/schema";

/**
 * Warm, human copy for a notification row (issue #348). Pure and UI-agnostic so
 * the bell dropdown, the full inbox, and tests all render the same sentence.
 * `context` is the short pre-rendered label stored on the notification (usually
 * a recipe title or group name); `actor` is the display name of who caused it.
 */
export function notificationSentence(
  type: NotificationType,
  actor: string,
  context: string | null,
): string {
  const who = actor.trim().length > 0 ? actor.trim() : "Someone";
  const on = context && context.trim().length > 0 ? context.trim() : null;

  switch (type) {
    case "mention":
      return on ? `${who} mentioned you on ${on}` : `${who} mentioned you`;
    case "comment_reply":
      return on
        ? `${who} replied to your comment on ${on}`
        : `${who} replied to your comment`;
    case "suggestion":
      return on
        ? `${who} suggested an edit to ${on}`
        : `${who} suggested an edit`;
    case "review":
      return on ? `${who} reviewed ${on}` : `${who} left a review`;
    case "cook":
      return on ? `${who} cooked ${on}` : `${who} cooked your recipe`;
    case "reaction":
      return on
        ? `${who} reacted to your ${on}`
        : `${who} reacted to your post`;
    case "group_invite":
      return on
        ? `${who} invited you to ${on}`
        : `${who} invited you to a group`;
    case "group_join":
      return on ? `${who} joined ${on}` : `${who} joined your group`;
    case "cook_along_invite":
      return on
        ? `${who} invited you to cook ${on} together`
        : `${who} invited you to a cook-along`;
    case "cook_along_reminder":
      return on ? `Cook-along soon: ${on}` : "You have a cook-along coming up";
    case "report":
      return on
        ? `New report to review in ${on}`
        : "New content report to review";
    default:
      return on ? `${who}: ${on}` : who;
  }
}
