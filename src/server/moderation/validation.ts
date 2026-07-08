import { z } from "zod";

/**
 * Shared validation for the moderation surface: personal blocks (#355), content
 * reports (#356), and the moderation queue's hide/dismiss actions (#357). Client
 * menus and the server actions import these so the shapes match end to end.
 */

const idInput = z.string().trim().min(1);

/** What a report / hide action targets. Mirrors the `moderation_target` enum. */
export const moderationTargetInput = z.enum(["comment", "review", "cook_log"]);

export const blockUserInput = z.object({
  blockedId: idInput,
});

export const unblockUserInput = z.object({
  blockedId: idInput,
});

export const reportContentInput = z.object({
  targetType: moderationTargetInput,
  targetId: idInput,
  reason: z.enum(["spam", "harassment", "inappropriate", "other"]),
  detail: z
    .string()
    .trim()
    .max(1000, "Keep the detail under 1,000 characters.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export const hideContentInput = z.object({
  targetType: moderationTargetInput,
  targetId: idInput,
  groupSlug: idInput,
});

export const dismissReportInput = z.object({
  targetType: moderationTargetInput,
  targetId: idInput,
  groupSlug: idInput,
});

export type BlockUserInput = z.infer<typeof blockUserInput>;
export type UnblockUserInput = z.infer<typeof unblockUserInput>;
export type ReportContentInput = z.infer<typeof reportContentInput>;
export type HideContentInput = z.infer<typeof hideContentInput>;
export type DismissReportInput = z.infer<typeof dismissReportInput>;
