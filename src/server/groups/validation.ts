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

/** Invitee email — validated + normalized, or dropped when left blank. */
const optionalInviteEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320)
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * A group invitation (issue #181). At least one of `email`/`handle` must be
 * given (mirrored by the `group_invitations_contact_check` DB constraint); the
 * granted role is limited to the manageable set (never owner). `expiresInDays`
 * bounds how long the accept link stays valid.
 */
export const inviteInput = z
  .object({
    email: optionalInviteEmail,
    handle: optionalString(61),
    role: manageableRole.default("member"),
    expiresInDays: z.coerce.number().int().min(1).max(90).default(14),
  })
  .refine((v) => Boolean(v.email ?? v.handle), {
    message: "Enter an email or handle to invite",
    path: ["email"],
  });

/**
 * A shareable group invite link (issue #343). Unlike a targeted invitation this
 * link can be forwarded to anyone, so its role is deliberately limited to the
 * non-privileged set (`member`/`kid`) — a link that mints admins is a footgun.
 * `expiresInDays`/`maxUses` are optional caps; omitting both makes an evergreen,
 * unlimited link.
 */
export const inviteLinkRole = z.enum(["member", "kid"]);

export const createInviteLinkInput = z.object({
  role: inviteLinkRole.default("member"),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
  maxUses: z.coerce.number().int().min(1).max(1000).optional(),
});

export type GroupInput = z.infer<typeof groupInput>;
export type AddMemberInput = z.infer<typeof addMemberInput>;
export type UpdateRoleInput = z.infer<typeof updateRoleInput>;
export type InviteInput = z.input<typeof inviteInput>;
export type CreateInviteLinkInput = z.input<typeof createInviteLinkInput>;
