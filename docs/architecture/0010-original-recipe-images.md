# ADR-0010: Original recipe images are ordered recipe attachments

- **Status:** Accepted
- **Date:** 2026-09-06
- **Issue:** [#376](https://github.com/jrmoulckers/jrm-recipes/issues/376)

## Context

A cover photo shows the finished dish. A photograph of a handwritten card or cookbook page preserves
the recipe's source: handwriting, edits, stains, and other family history that a transcription loses.
Treating both as one image would force users to choose between presentation and provenance.

Source photos are personal data. They may contain handwriting, names, addresses, faces, or location
metadata, and Cloudinary receives the uploaded bytes. They also participate in shared recipes, whose
media may outlive the uploader's account under
[ADR-0009](./0009-account-deletion-and-shared-recipes.md).

OCR is tracked separately in #374. This decision must leave a safe reference point for that work
without extracting, inferring, or saving any text now.

## Decision

### A recipe owns an ordered collection

`recipe_source_images` stores zero to twelve ordered attachments per recipe. Each attachment has a
stable id, authoritative image URL, optional visible caption, and optional alt text. Position is
unique per recipe and constrained to `0..11`, so the database enforces the product cap without a
trigger.

The stable attachment id is the future OCR boundary: a later, separately reviewed flow may authorize
an attachment id and read its image. No OCR status, recognized text, provider call, or automatic
recipe mutation is part of this decision.

### Media custody remains separate

Uploads continue through the existing signed Cloudinary and `media_assets` path. The attachment does
not duplicate upload ownership, byte size, or billing state; its URL connects it to the additive media
inventory in the same way as recipe covers and step photos.

Detaching a source image from a recipe does not delete the media-library asset or reduce storage
usage. Remote deletion remains an explicit media-library action, where all live uses can be checked.

### Recipe permissions and lifecycle apply

The owner and accepted co-creators may edit source images through the normal recipe-body update.
Pending invitations and read-only viewers cannot. Recipe visibility governs who can view the images.

Recipe soft deletion retains attachments so restore is lossless. A hard recipe deletion cascades the
attachment metadata. Account deletion inventories both current attachments and historical version snapshots: media on
retained shared recipes or independently owned surviving forks transfers custody under ADR-0009,
while destroyable media on deleted content follows the verified Cloudinary purge path.

Owned-recipe and shared-contribution exports include ordered attachment metadata and URLs. Export
remains reference based; it does not fetch remote image bytes into the archive.

### Caption and alt text have different jobs

Captions provide visible family context. Alt text describes the image for someone who cannot see it.
Both are optional and stored independently. When alt text is absent, the viewer generates a localized
positional fallback rather than reusing a caption that may not describe the visual.

## Consequences

- The editor needs ordered, keyboard-operable controls and a clear twelve-image limit.
- The detail page can remain server-rendered and use native disclosure plus lazy images, avoiding a
  new gallery dependency and route-bundle cost.
- Media usage, custody, erasure, export, and version snapshot code must treat source image URLs as
  first-class recipe media.
- Cloudinary remains the existing processor; its registered data category expands explicitly to
  handwritten source documents.
