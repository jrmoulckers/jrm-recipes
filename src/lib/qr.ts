import qrcode from "qrcode-generator";

/**
 * Dependency-light QR generation for print (issue #350). Wraps the tiny,
 * zero-runtime-dep `qrcode-generator` to produce a *vector* description — a
 * single SVG path over a unit grid — so the printed code stays crisp at any
 * size. Pure + deterministic, so it unit tests without a DOM.
 */

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

export type QrCode = {
  /** Number of modules per side of the QR matrix (excludes the quiet zone). */
  count: number;
  /** Full `viewBox` side length in module units (matrix + 2× margin). */
  size: number;
  /** SVG path data drawing one 1×1 square per dark module, offset by margin. */
  path: string;
};

/**
 * Encode `data` into a QR matrix and emit it as an SVG path over a
 * `size × size` unit grid. `margin` is the quiet zone in modules (the QR spec
 * recommends 4, which scanners rely on). Returns an empty path for empty input.
 */
export function buildQrCode(
  data: string,
  opts: { margin?: number; errorCorrection?: QrErrorCorrection } = {},
): QrCode {
  const margin = opts.margin ?? 4;
  if (data.length === 0) return { count: 0, size: margin * 2, path: "" };

  const qr = qrcode(0, opts.errorCorrection ?? "M");
  qr.addData(data);
  qr.make();

  const count = qr.getModuleCount();
  const size = count + margin * 2;

  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        path += `M${col + margin} ${row + margin}h1v1h-1z`;
      }
    }
  }

  return { count, size, path };
}
