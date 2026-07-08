"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authedAction } from "~/server/action";
import { ok, type ActionResult } from "~/server/action-result";
import {
  listNotifications,
  type NotificationPage,
} from "./queries";
import { markAllNotificationsRead, markNotificationRead } from "./mutations";

const markReadInput = z.object({ notificationId: z.string().trim().min(1) });

/** Mark a single notification read (from the bell dropdown / inbox). */
export const markNotificationReadAction = authedAction({
  input: markReadInput,
  handler: async (data, user): Promise<ActionResult> => {
    await markNotificationRead(data.notificationId, user);
    revalidatePath("/notifications");
    return ok();
  },
});

/** Mark every unread notification read ("Mark all as read"). */
export const markAllNotificationsReadAction = authedAction({
  input: z.object({}).optional().default({}),
  handler: async (_data, user): Promise<ActionResult> => {
    await markAllNotificationsRead(user);
    revalidatePath("/notifications");
    return ok();
  },
});

const loadInput = z.object({ cursor: z.string().min(1).nullable().default(null) });

/** Fetch an older page of notifications for the inbox "Load older" button. */
export const loadNotificationsAction = authedAction({
  input: loadInput,
  handler: async (data, user): Promise<ActionResult<NotificationPage>> => {
    const page = await listNotifications(user.id, {
      limit: 20,
      cursor: data.cursor,
    });
    return ok(page);
  },
});
