/* eslint-disable @next/next/no-img-element */
import * as React from "react";

/**
 * Shared renderer for the branded recipe "share card" (Open Graph image).
 *
 * Kept out of the route file so it can be reused by the OG route and by any
 * future social surfaces. Everything here is satori-safe (flexbox only, no
 * grid/filter/text-wrap) and fully self-contained — fonts are bundled and the
 * cover photo is embedded as bytes by the caller, so rendering never depends
 * on a live network fetch.
 */

export const SIZE = { width: 1200, height: 630 } as const;
export const ALT = "A recipe on Heirloom";

export const CREAM = "#fffaf3";
export const INK = "#3d2817";
export const TERRACOTTA = "#b45309";
export const TERRACOTTA_DEEP = "#7c3d06";
export const MUTED = "#6f5844";

export type CardDifficulty = "easy" | "medium" | "hard";

export type CardData = {
  title: string;
  description?: string | null;
  /** Data URI (embedded bytes) — never a remote URL, so satori can't fail. */
  cover?: string | null;
  author?: string | null;
  group?: string | null;
  totalMinutes?: number | null;
  servings?: number | null;
  servingsNoun?: string | null;
  difficulty?: CardDifficulty | null;
  cuisine?: string | null;
};

const DIFFICULTY_DOT: Record<CardDifficulty, string> = {
  easy: "#2f7d4f",
  medium: "#b4690e",
  hard: "#a23b2f",
};

function formatMins(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Turn recipe fields into chip labels, skipping anything we don't have. */
function metaChips(data: CardData) {
  const chips: { label: string; dot?: string }[] = [];
  if (data.totalMinutes && data.totalMinutes > 0) {
    chips.push({ label: formatMins(data.totalMinutes) });
  }
  if (data.servings && data.servings > 0) {
    const noun = (data.servingsNoun ?? "servings").trim() || "servings";
    chips.push({ label: `Serves ${data.servings}` });
    void noun;
  }
  if (data.difficulty) {
    const d = data.difficulty;
    chips.push({
      label: d.charAt(0).toUpperCase() + d.slice(1),
      dot: DIFFICULTY_DOT[d],
    });
  }
  if (data.cuisine) chips.push({ label: data.cuisine });
  return chips;
}

/** Scale the title so long names still fit within three lines. */
function titleSize(title: string): number {
  const n = title.length;
  if (n <= 22) return 78;
  if (n <= 36) return 66;
  if (n <= 54) return 54;
  if (n <= 78) return 46;
  return 40;
}

export function Wordmark({ onDark }: { onDark: boolean }) {
  const fg = onDark ? CREAM : TERRACOTTA_DEEP;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: 16,
          background: `linear-gradient(145deg, ${TERRACOTTA} 0%, ${TERRACOTTA_DEEP} 100%)`,
          boxShadow: "0 6px 18px rgba(124,61,6,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Fraunces",
            fontSize: 38,
            fontWeight: 600,
            color: CREAM,
            marginTop: -4,
          }}
        >
          H
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "Nunito",
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: -0.5,
          color: fg,
        }}
      >
        Heirloom
      </div>
    </div>
  );
}

function Chips({ data, onDark }: { data: CardData; onDark: boolean }) {
  const chips = metaChips(data);
  if (chips.length === 0) return null;
  const bg = onDark ? "rgba(255,250,243,0.16)" : "rgba(180,83,9,0.08)";
  const border = onDark ? "rgba(255,255,255,0.4)" : "rgba(180,83,9,0.3)";
  const fg = onDark ? CREAM : INK;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
      {chips.map((c, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 22px",
            borderRadius: 999,
            background: bg,
            border: `1px solid ${border}`,
            fontFamily: "Nunito",
            fontSize: 27,
            fontWeight: 600,
            color: fg,
          }}
        >
          {c.dot ? (
            <div
              style={{
                display: "flex",
                width: 14,
                height: 14,
                borderRadius: 999,
                background: c.dot,
              }}
            />
          ) : null}
          {c.label}
        </div>
      ))}
    </div>
  );
}

function Byline({ data, onDark }: { data: CardData; onDark: boolean }) {
  const author = data.author?.trim();
  const group = data.group?.trim();
  if (!author && !group) return null;
  const fg = onDark ? "rgba(255,250,243,0.92)" : MUTED;
  const parts: string[] = [];
  if (author) parts.push(`by ${author}`);
  if (group) parts.push(group);
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Nunito",
        fontSize: 26,
        fontWeight: 600,
        color: fg,
      }}
    >
      {parts.join("  ·  ")}
    </div>
  );
}

export function clampText(lines: number): React.CSSProperties {
  return {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: lines,
    overflow: "hidden",
  };
}

/** The recipe card. Pass `null` for a neutral, no-data brand card. */
export function RecipeCard({ data }: { data: CardData | null }) {
  if (!data) return <BrandCard />;
  return data.cover ? <CoverCard data={data} /> : <PlainCard data={data} />;
}

function CoverCard({ data }: { data: CardData }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        fontFamily: "Nunito",
      }}
    >
      <img
        src={data.cover ?? ""}
        alt=""
        width={1200}
        height={630}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          display: "flex",
          background:
            "linear-gradient(105deg, rgba(36,19,9,0.9) 0%, rgba(36,19,9,0.62) 44%, rgba(36,19,9,0.12) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 64,
        }}
      >
        <Wordmark onDark />
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              ...clampText(3),
              fontFamily: "Fraunces",
              fontSize: titleSize(data.title),
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -1,
              color: CREAM,
              maxWidth: 1000,
            }}
          >
            {data.title}
          </div>
          <Chips data={data} onDark />
          <Byline data={data} onDark />
        </div>
      </div>
    </div>
  );
}

function PlainCard({ data }: { data: CardData }) {
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
          RECIPE
        </div>
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 26,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 88,
            height: 6,
            borderRadius: 999,
            background: TERRACOTTA,
          }}
        />
        <div
          style={{
            display: "flex",
            ...clampText(3),
            fontFamily: "Fraunces",
            fontSize: titleSize(data.title),
            fontWeight: 600,
            lineHeight: 1.04,
            letterSpacing: -1,
            color: TERRACOTTA_DEEP,
            maxWidth: 1040,
          }}
        >
          {data.title}
        </div>
        {data.description ? (
          <div
            style={{
              display: "flex",
              ...clampText(2),
              fontFamily: "Nunito",
              fontSize: 28,
              fontWeight: 600,
              lineHeight: 1.35,
              color: MUTED,
              maxWidth: 940,
            }}
          >
            {data.description}
          </div>
        ) : null}
        <div style={{ display: "flex", marginTop: 6 }}>
          <Chips data={data} onDark={false} />
        </div>
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <Byline data={data} onDark={false} />
        <div
          style={{
            display: "flex",
            fontFamily: "Nunito",
            fontSize: 24,
            fontWeight: 600,
            color: MUTED,
          }}
        >
          heirloom.jrmoulckers.com
        </div>
      </div>
    </div>
  );
}

export function BrandCard() {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        width: "100%",
        height: "100%",
        padding: 80,
        background: `linear-gradient(140deg, ${TERRACOTTA} 0%, ${TERRACOTTA_DEEP} 100%)`,
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
            "radial-gradient(circle at 82% 20%, rgba(255,250,243,0.18) 0%, rgba(255,250,243,0) 45%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 22,
          marginBottom: 30,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 76,
            height: 76,
            borderRadius: 22,
            background: CREAM,
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Fraunces",
              fontSize: 52,
              fontWeight: 600,
              color: TERRACOTTA_DEEP,
              marginTop: -6,
            }}
          >
            H
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Nunito",
            fontSize: 46,
            fontWeight: 800,
            color: CREAM,
            letterSpacing: -0.5,
          }}
        >
          Heirloom
        </div>
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          fontFamily: "Fraunces",
          fontSize: 68,
          fontWeight: 600,
          lineHeight: 1.05,
          letterSpacing: -1.5,
          color: CREAM,
          maxWidth: 900,
        }}
      >
        Family recipes, kept alive.
      </div>
    </div>
  );
}
