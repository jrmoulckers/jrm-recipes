/* eslint-disable @next/next/no-img-element */
import * as React from "react";

import {
  BrandCard,
  CREAM,
  MUTED,
  TERRACOTTA,
  TERRACOTTA_DEEP,
  Wordmark,
  clampText,
} from "../recipes/[id]/_assets/card";

/**
 * Shared, satori-safe Open Graph cards for public *social* surfaces — creator
 * profiles (issue #337) and group cookbooks (issue #339). Reuses the recipe
 * card's brand palette, `Wordmark`, and neutral `BrandCard` fallback plus the
 * font/cover helpers in `_assets/og.ts`, so there's a single satori setup. Only
 * public-safe fields are ever passed in; unknown handles/slugs render the
 * neutral brand card via `data === null`.
 */

export type ProfileCardData = {
  name: string;
  handle: string;
  /** Data URI (embedded bytes) for the avatar, or null for an initials chip. */
  avatar?: string | null;
  recipeCount: number;
};

export type GroupCardData = {
  name: string;
  avatar?: string | null;
  memberCount: number;
  recipeCount: number;
};

/** Two-letter initials for the avatar fallback. */
export function ogInitials(source: string): string {
  const words = source.split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return "?";
  const letters =
    words.length === 1
      ? first.slice(0, 2)
      : `${first[0] ?? ""}${words[1]?.[0] ?? ""}`;
  return (letters || "?").toUpperCase();
}

function AvatarCircle({
  src,
  initials,
  size,
}: {
  src?: string | null;
  initials: string;
  size: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 999,
        background: `linear-gradient(145deg, ${TERRACOTTA} 0%, ${TERRACOTTA_DEEP} 100%)`,
        border: `6px solid ${CREAM}`,
        boxShadow: "0 8px 24px rgba(124,61,6,0.28)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            fontFamily: "Nunito",
            fontSize: size * 0.4,
            fontWeight: 800,
            color: CREAM,
          }}
        >
          {initials}
        </div>
      )}
    </div>
  );
}

function Frame({
  kicker,
  children,
}: {
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 64,
        background: CREAM,
        fontFamily: "Nunito",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          display: "flex",
          background:
            "radial-gradient(circle at 88% 6%, rgba(180,83,9,0.16) 0%, rgba(180,83,9,0) 42%), radial-gradient(circle at 108% 96%, rgba(180,83,9,0.12) 0%, rgba(180,83,9,0) 40%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Wordmark onDark={false} />
        <div
          style={{
            display: "flex",
            fontFamily: "Nunito",
            fontSize: 24,
            fontWeight: 700,
            color: TERRACOTTA_DEEP,
            letterSpacing: 0.3,
          }}
        >
          {kicker}
        </div>
      </div>
      {children}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "flex-end",
          fontFamily: "Nunito",
          fontSize: 24,
          fontWeight: 600,
          color: MUTED,
        }}
      >
        heirloom.jrmoulckers.com
      </div>
    </div>
  );
}

function titleSize(name: string): number {
  const n = name.length;
  if (n <= 18) return 72;
  if (n <= 30) return 60;
  if (n <= 46) return 50;
  return 42;
}

/** Creator profile card: avatar, name, @handle, public-recipe count. */
export function ProfileCard({ data }: { data: ProfileCardData | null }) {
  if (!data) return <BrandCard />;
  const { name, handle, avatar, recipeCount } = data;
  const recipeLabel = `${recipeCount} public recipe${recipeCount === 1 ? "" : "s"}`;
  return (
    <Frame kicker="COOK">
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 40,
        }}
      >
        <AvatarCircle
          src={avatar}
          initials={ogInitials(name || handle)}
          size={200}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              ...clampText(2),
              fontFamily: "Fraunces",
              fontSize: titleSize(name),
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -1,
              color: TERRACOTTA_DEEP,
              maxWidth: 760,
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Nunito",
              fontSize: 30,
              fontWeight: 700,
              color: MUTED,
            }}
          >
            @{handle}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Nunito",
              fontSize: 28,
              fontWeight: 600,
              color: TERRACOTTA,
            }}
          >
            {recipeLabel}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** Group cookbook card: avatar/initials, name, member + recipe counts. */
export function GroupCard({ data }: { data: GroupCardData | null }) {
  if (!data) return <BrandCard />;
  const { name, avatar, memberCount, recipeCount } = data;
  const metaLabel = `${memberCount} member${memberCount === 1 ? "" : "s"}  ·  ${recipeCount} recipe${recipeCount === 1 ? "" : "s"}`;
  return (
    <Frame kicker="FAMILY COOKBOOK">
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 40,
        }}
      >
        <AvatarCircle src={avatar} initials={ogInitials(name)} size={200} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              ...clampText(2),
              fontFamily: "Fraunces",
              fontSize: titleSize(name),
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -1,
              color: TERRACOTTA_DEEP,
              maxWidth: 760,
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Nunito",
              fontSize: 28,
              fontWeight: 600,
              color: MUTED,
            }}
          >
            {metaLabel}
          </div>
        </div>
      </div>
    </Frame>
  );
}
