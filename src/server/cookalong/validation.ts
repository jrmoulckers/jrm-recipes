import { z } from "zod";

/**
 * Validation contract for cook-alongs (issue #353). Shared by the schedule
 * dialog (client) and the server actions so the shape is guaranteed end to end.
 */

const idInput = z.string().trim().min(1);

const optionalTitle = z
  .string()
  .trim()
  .max(200, "Keep the title under 200 characters.")
  .optional()
  .transform((v) => (v == null || v.length === 0 ? undefined : v));

const optionalNote = z
  .string()
  .trim()
  .max(2000, "Keep your note under 2,000 characters.")
  .optional()
  .transform((v) => (v == null || v.length === 0 ? undefined : v));

/** A future date/time. Accepts a Date or parseable string. */
const scheduledFor = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => !Number.isNaN(d.getTime()), "Pick a valid date and time.")
  .refine((d) => d.getTime() > Date.now(), "Pick a time in the future.");

export const createCookAlongInput = z.object({
  groupId: idInput,
  recipeId: idInput,
  title: optionalTitle,
  note: optionalNote,
  scheduledFor,
});

export const updateCookAlongInput = z.object({
  cookAlongId: idInput,
  title: optionalTitle,
  note: optionalNote,
  scheduledFor,
});

export const rsvpInput = z.object({
  cookAlongId: idInput,
  status: z.enum(["going", "maybe", "declined"]),
});

export const deleteCookAlongInput = z.object({
  cookAlongId: idInput,
});

export type CreateCookAlongInput = z.infer<typeof createCookAlongInput>;
export type UpdateCookAlongInput = z.infer<typeof updateCookAlongInput>;
export type RsvpInput = z.infer<typeof rsvpInput>;
export type DeleteCookAlongInput = z.infer<typeof deleteCookAlongInput>;
