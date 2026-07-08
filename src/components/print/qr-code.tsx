import * as React from "react";

import { brand } from "~/config/brand";
import { cn } from "~/lib/utils";
import { buildQrCode } from "~/lib/qr";

/**
 * A small, print-crisp QR code linking a printed recipe card back to its public
 * URL (issue #350). Renders as an inline vector SVG (black on white, quiet-zone
 * margin baked in) so it stays scannable at any print size and never depends on
 * an external image. Callers only render it when a shareable URL exists.
 */
export function PrintQr({
  url,
  caption = `Scan to open on ${brand.name}`,
  size = 92,
  className,
}: {
  url: string;
  caption?: string | null;
  size?: number;
  className?: string;
}) {
  const qr = React.useMemo(() => buildQrCode(url), [url]);
  if (!qr.path) return null;

  return (
    <figure
      className={cn(
        "flex shrink-0 flex-col items-center gap-1 text-center",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        role="img"
        aria-label={caption ?? `QR code linking to ${url}`}
        className="h-auto rounded-md border border-border bg-white p-1 print:border-black/30"
      >
        <rect width={qr.size} height={qr.size} fill="#ffffff" />
        <path d={qr.path} fill="#000000" />
      </svg>
      {caption ? (
        <figcaption className="max-w-[8rem] text-[0.6rem] leading-tight text-muted-foreground print:text-black">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
