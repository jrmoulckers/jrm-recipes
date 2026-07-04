import { z } from "zod";

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v == null || v.length === 0 ? undefined : v));

const optionalUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const groupInput = z.object({
  name: z.string().trim().min(1, "Give your group a name").max(120),
  description: optionalString(500),
  avatarUrl: optionalUrl,
});

export const manageableRole = z.enum(["admin", "member", "kid"]);

export const addMemberInput = z.object({
  identifier: z.string().trim().min(1, "Enter a handle or email"),
  role: manageableRole.default("member"),
});

export const updateRoleInput = z.object({
  role: manageableRole,
});

export type GroupInput = z.infer<typeof groupInput>;
export type AddMemberInput = z.infer<typeof addMemberInput>;
export type UpdateRoleInput = z.infer<typeof updateRoleInput>;
