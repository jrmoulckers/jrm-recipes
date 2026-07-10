# Family group roles & permissions

How membership works inside a Heirloom family group: the four roles, exactly what
each one can do, and the rules the server enforces on every change. This is the
canonical reference for the group role model (issues #372 and #344).

The source of truth is the code, not this page:

- Roles enum: `member_role` in
  [`src/server/db/schema/groups.ts`](../src/server/db/schema/groups.ts).
- Permission checks: [`src/server/groups/mutations.ts`](../src/server/groups/mutations.ts)
  (`requireManager`, `requireOwner`, per-action guards).
- Read helpers: `canManage` / `isOwner` in
  [`src/server/groups/queries.ts`](../src/server/groups/queries.ts).
- Input validation (which roles are assignable where):
  [`src/server/groups/validation.ts`](../src/server/groups/validation.ts).

## The four roles

A group is a family or shared space that recipes belong to and members
collaborate in. Every membership carries exactly one role, stored on
`group_members.role` and defaulting to `member`.

| Role       | Who they are                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| **Owner**  | The person ultimately responsible for the group. The creator starts as owner; there is always at least one. |
| **Admin**  | A trusted manager who helps run day-to-day membership and settings.                                         |
| **Member** | A regular family member: reads the shared cookbook and adds recipes.                                        |
| **Kid**    | A child account with the kid-safe experience. Rides free — never consumes a paid seat.                      |

Roles are ordered `owner → admin → member → kid` (see `ROLE_ORDER` in
`queries.ts`), which is only used for sorting the member list.

`owner` and `admin` are the **manager** roles (`MANAGER_ROLES` in
`mutations.ts`); `canManage(role)` returns true for exactly these two and is what
the UI uses to decide whether to show management surfaces.

## Capability matrix

Legend: ✅ allowed · ⚠️ allowed with limits (see notes) · ❌ not allowed.

| Capability                               | Owner | Admin | Member | Kid |
| ---------------------------------------- | :---: | :---: | :----: | :-: |
| View the group cookbook & shared recipes |  ✅   |  ✅   |   ✅   | ✅  |
| Add recipes to the group                 |  ✅   |  ✅   |   ✅   | ✅  |
| Edit group settings (name, note, photo)  |  ✅   |  ✅   |   ❌   | ❌  |
| Invite people / create invite links      |  ✅   |  ⚠️   |   ❌   | ❌  |
| Add an **admin** (grant elevated role)   |  ✅   |  ❌   |   ❌   | ❌  |
| Add a member or kid                      |  ✅   |  ✅   |   ❌   | ❌  |
| Change another member's role             |  ✅   |  ❌   |   ❌   | ❌  |
| Remove a member or kid                   |  ✅   |  ⚠️   |   ❌   | ❌  |
| Remove another admin                     |  ✅   |  ❌   |   ❌   | ❌  |
| Transfer ownership                       |  ✅   |  ❌   |   ❌   | ❌  |
| Delete the group                         |  ✅   |  ❌   |   ❌   | ❌  |
| Leave the group                          |  ⚠️   |  ✅   |   ✅   | ✅  |

## The enforcement rules (what the server guarantees)

Every mutation runs inside a transaction and re-checks the actor's role from the
database — the UI never gets to decide permissions. Failures raise a typed
`DomainError` (`FORBIDDEN`, `OWNER_CANT_LEAVE`, `SEAT_LIMIT_REACHED`, …).

- **Managing settings** (`updateGroup`) requires a manager (owner or admin).
- **Inviting** (`createInvitation`, `createInviteLink`) requires a manager. But:
  - Only an **owner** may invite/add someone as an **admin**; an admin who tries
    to mint a fellow admin is rejected (`addMember` / `createInvitation`).
  - **Shareable invite links** can only ever grant `member` or `kid`
    (`inviteLinkRole` in `validation.ts`) — a forwardable link that mints admins
    is a footgun, so it's impossible.
- **Changing a role** (`updateMemberRole`) is **owner-only**. You cannot set
  someone to `owner` this way (use ownership transfer), and you cannot change an
  existing owner's role.
- **Removing a member** (`removeMember`) requires a manager, with guards:
  - An owner can never be removed.
  - An admin cannot remove **another** admin — only an owner can. (An admin may
    remove themselves.)
- **Leaving** (`leaveGroup`) is open to any member, except the **last owner**: a
  group must always have an owner, so the sole owner is blocked with
  `OWNER_CANT_LEAVE` and must transfer ownership or delete the group first.
- **Transferring ownership** (`transferOwnership`) is owner-only. It promotes the
  target to `owner` and demotes the previous owner to `admin` in the same
  transaction, so control is handed over atomically.
- **Deleting the group** (`deleteGroup`) is owner-only. Deleting a group cascades
  to its memberships, invitations, and invite links (see the `onDelete: "cascade"`
  foreign keys in `groups.ts`).

Every one of these changes is written to the audit log (`recordAudit`) so group
management is fully traceable.

## Seats & the "kids ride free" rule

Paid **Family** plans are seat-limited (see
[`src/config/plans.ts`](../src/config/plans.ts) and
[`../docs/pricing-and-packaging.md`](./pricing-and-packaging.md)). When adding or
accepting a member, `assertSeatAvailable` counts seat-consuming members against
the plan's limit and rejects with `SEAT_LIMIT_REACHED` once full.

`kid`-role members do **not** consume a seat (`SEAT_RULES.kidsCountAsSeats =
false`), so a family is never nudged to leave a child off the account. Seat
enforcement also fails **open**: if the seat limit can't be resolved (e.g. a
billing hiccup), the add is allowed rather than blocking a family.

## Invitations vs. invite links

There are two ways to bring someone in, both manager-only:

- **Targeted invitation** (`group_invitations`): keyed to an email and/or handle,
  carries the role the invitee will get on accept, an opaque accept-link `token`,
  and an optional expiry. At most one _pending_ invite per (group, email).
- **Shareable invite link** (`group_invite_links`): carries no invitee — anyone
  who opens the URL joins at the link's role. Capped to `member`/`kid`, and can be
  time-limited (`expiresAt`), use-limited (`maxUses`), or revoked (`revokedAt`).

## Recipe visibility inside a group

Role governs _management_; recipe **visibility** governs what shows up in the
cookbook (`canListInGroupCookbook` in `queries.ts`):

- Authors always see their own recipes.
- Members see recipes shared to the group (`group`) plus `public` ones, but never
  a fellow member's `private` (author-only) or `unlisted` (share-token-only)
  recipes.
- Non-members (the public cookbook view) only ever see recipes that are both
  `public` and `published`.

_Related issues: #372, #344._
