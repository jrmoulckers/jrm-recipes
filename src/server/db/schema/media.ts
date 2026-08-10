import { isNull, relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { fk, pk, softDelete, timestamps } from "./_shared";
import { users } from "./users";

/**
 * Media library (issue #657, epic #655).
 *
 * Before this table every image in the app was a bare URL string on whatever
 * row happened to need one (`recipes.coverImageUrl`, `collections.coverImageUrl`,
 * `groups.avatarUrl`, …). That made a photo un-reusable, un-deletable, and
 * un-describable: clearing a column orphaned the Cloudinary asset forever while
 * it kept counting against the owner's `storage_mb` allowance.
 *
 * `media_assets` gives an upload an owner and a lifecycle. It is deliberately
 * *additive*: the existing URL columns stay authoritative for rendering, and an
 * asset links to them by URL rather than by foreign key. Nothing breaks if an
 * asset row is missing (pre-existing photos, or an upload whose bookkeeping call
 * failed), and there is no lossy backfill to get wrong.
 */

/**
 * Where the bytes live. `cloudinary` assets we uploaded and can therefore
 * destroy; `external` assets are URLs a user pasted, which we can list and
 * describe but must never attempt to delete remotely.
 */
export const mediaProvider = pgEnum("media_provider", [
  "cloudinary",
  "external",
]);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: pk(),
    // `restrict`, not `cascade` (issue #678). This row is the only record that a
    // Cloudinary asset exists: cascading it away on account deletion would drop
    // the bookkeeping without ever calling `uploader.destroy`, stranding the
    // image on the CDN forever with nothing left pointing at it. Erasure must
    // destroy the remote bytes first and then delete these rows explicitly.
    userId: fk()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    provider: mediaProvider().notNull().default("cloudinary"),
    /**
     * Cloudinary public id, required to call `uploader.destroy`. Null for
     * `external` assets, which we have no delete authority over.
     */
    publicId: varchar({ length: 255 }),
    /** Delivery URL. Always validated against ALLOWED_MEDIA_HOSTS (#216). */
    url: varchar({ length: 2048 }).notNull(),
    /** Author-supplied description, read by screen readers (#125). */
    altText: varchar({ length: 300 }),
    width: integer(),
    height: integer(),
    /** Original byte size, used to reclaim `storage_mb` on delete. */
    bytes: integer(),
    format: varchar({ length: 16 }),
    /** Which `heirloom/*` namespace the upload targeted. */
    folder: varchar({ length: 200 }),
    ...timestamps(),
    // Tombstone rather than hard delete: the Cloudinary asset is gone, but we
    // keep provenance so storage accounting stays auditable.
    ...softDelete(() => users.id),
  },
  (t) => [
    // Library listing: a user's newest assets first.
    index("media_assets_user_idx").on(t.userId, t.createdAt),
    // Lets the settings page answer "is this photo still in use?" by URL, and
    // covers the reverse lookup from a stored column back to its asset.
    index("media_assets_url_idx").on(t.url),
    // The upload widget's success callback can fire more than once (retries,
    // remounts). Keying on (userId, publicId) makes `recordUpload` an upsert
    // instead of a duplicate-row generator. Postgres treats NULLs as distinct,
    // so `external` assets (publicId NULL) never collide with each other.
    // Partial on live rows so a tombstoned asset can't block a re-upload that
    // happens to reuse a public id.
    uniqueIndex("media_assets_user_public_id_uq")
      .on(t.userId, t.publicId)
      .where(isNull(t.deletedAt)),
  ],
);

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  owner: one(users, {
    fields: [mediaAssets.userId],
    references: [users.id],
    relationName: "mediaOwner",
  }),
}));

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
export type MediaProvider = (typeof mediaProvider.enumValues)[number];
