/**
 * Browser-only canvas renderer for the recipe Reel.
 *
 * Draws the ordered {@link ReelScene} list produced by `~/lib/reel/scenes` onto
 * a 1080x1920 canvas and (optionally) captures it to a downloadable webm via
 * MediaRecorder. All layout decisions live in the pure scene module; this file
 * only paints and animates.
 *
 * Accessibility: when `reducedMotion` is set, scenes render as a single static
 * frame with no movement — no Ken Burns, no entrance animation, no flashing.
 */

import {
  REEL_COLORS,
  REEL_FPS,
  REEL_SIZE,
  reelImageUrl,
  sceneAtTime,
  totalDurationMs,
  type ReelChip,
  type ReelScene,
} from "~/lib/reel/scenes";

const { width: W, height: H } = REEL_SIZE;
const MARGIN = 96;
const CONTENT_W = W - MARGIN * 2;

export type LoadedImages = Map<string, HTMLImageElement>;

/** Resolve the runtime font-family for a next/font CSS variable (canvas-safe). */
function fontFamily(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function displayFont(): string {
  return fontFamily("--font-fraunces", "Georgia, 'Times New Roman', serif");
}

function bodyFont(): string {
  return fontFamily("--font-nunito", "system-ui, -apple-system, sans-serif");
}

/** Load one image with CORS enabled so the canvas is never tainted. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Preload every image referenced by the scenes (cover + step photos), keyed by
 * their original url. Failed loads are simply omitted so scenes fall back to a
 * branded no-photo layout.
 */
export async function preloadReelImages(
  scenes: ReelScene[],
): Promise<LoadedImages> {
  const urls = new Set<string>();
  for (const scene of scenes) {
    if ("imageUrl" in scene && scene.imageUrl) urls.add(scene.imageUrl);
  }
  const map: LoadedImages = new Map();
  await Promise.all(
    [...urls].map(async (url) => {
      const optimized = reelImageUrl(url) ?? url;
      const img = await loadImage(optimized);
      if (img) map.set(url, img);
    }),
  );
  return map;
}

// ---------------------------------------------------------------------------
// Low-level drawing helpers
// ---------------------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Draw an image scaled to cover a rect, honoring an optional Ken Burns zoom. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom = 1,
): void {
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.save();
  roundRect(ctx, x, y, w, h, 0);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

/** Break text into lines that fit `maxWidth` for the current ctx font. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Draw wrapped, optionally line-clamped text; returns the y past the block. */
function drawParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = Infinity,
): number {
  let lines = wrapText(ctx, text, maxWidth);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = lines.length - 1;
    let clipped = lines[last]!;
    while (
      clipped.length > 1 &&
      ctx.measureText(`${clipped}\u2026`).width > maxWidth
    ) {
      clipped = clipped.slice(0, -1).trimEnd();
    }
    lines[last] = `${clipped}\u2026`;
  }
  let cursor = y;
  for (const line of lines) {
    ctx.fillText(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

/** Easing for entrance animations (smooth, no overshoot). */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Progress-driven entrance: alpha + translateY, or static when reduced. */
function entrance(progress: number, reducedMotion: boolean): {
  alpha: number;
  dy: number;
} {
  if (reducedMotion) return { alpha: 1, dy: 0 };
  const t = Math.min(1, progress / 0.16); // ramp over the first ~16% of the scene
  const e = easeOut(t);
  return { alpha: e, dy: (1 - e) * 40 };
}

function fillBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = REEL_COLORS.cream;
  ctx.fillRect(0, 0, W, H);
}

function linearGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: [number, string][],
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  return g;
}

// ---------------------------------------------------------------------------
// Shared brand marks
// ---------------------------------------------------------------------------

function drawWordmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  onDark: boolean,
): void {
  const size = 72;
  // Rounded terracotta tile with an "H".
  const g = linearGradient(ctx, x, y, x + size, y + size, [
    [0, REEL_COLORS.terracotta],
    [1, REEL_COLORS.terracottaDeep],
  ]);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, size, size, 20);
  ctx.fill();
  ctx.fillStyle = REEL_COLORS.cream;
  ctx.font = `600 46px ${displayFont()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("H", x + size / 2, y + size / 2 + 2);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = onDark ? REEL_COLORS.cream : REEL_COLORS.terracottaDeep;
  ctx.font = `800 44px ${bodyFont()}`;
  ctx.fillText("Heirloom", x + size + 22, y + size / 2 + 16);
}

function drawChips(
  ctx: CanvasRenderingContext2D,
  chips: ReelChip[],
  x: number,
  y: number,
  onDark: boolean,
): number {
  if (chips.length === 0) return y;
  const padX = 30;
  const gap = 18;
  const chipH = 68;
  const dotR = 9;
  ctx.font = `600 34px ${bodyFont()}`;
  ctx.textBaseline = "middle";
  let cx = x;
  let cy = y;
  for (const chip of chips) {
    const textW = ctx.measureText(chip.label).width;
    const dotW = chip.dot ? dotR * 2 + 14 : 0;
    const chipW = padX * 2 + dotW + textW;
    if (cx + chipW > x + CONTENT_W) {
      cx = x;
      cy += chipH + gap;
    }
    ctx.fillStyle = onDark ? "rgba(255,250,243,0.18)" : "rgba(180,83,9,0.10)";
    ctx.strokeStyle = onDark ? "rgba(255,255,255,0.45)" : "rgba(180,83,9,0.32)";
    ctx.lineWidth = 2;
    roundRect(ctx, cx, cy, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.stroke();
    let tx = cx + padX;
    if (chip.dot) {
      ctx.fillStyle = chip.dot;
      ctx.beginPath();
      ctx.arc(tx + dotR, cy + chipH / 2, dotR, 0, Math.PI * 2);
      ctx.fill();
      tx += dotR * 2 + 14;
    }
    ctx.fillStyle = onDark ? REEL_COLORS.cream : REEL_COLORS.ink;
    ctx.textAlign = "left";
    ctx.fillText(chip.label, tx, cy + chipH / 2 + 2);
    cx += chipW + gap;
  }
  ctx.textBaseline = "alphabetic";
  return cy + chipH;
}

/** A slim reel-progress bar across the top (skipped when motion is reduced). */
function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  fraction: number,
  onDark: boolean,
): void {
  const y = 24;
  const h = 8;
  const x = MARGIN;
  const w = CONTENT_W;
  ctx.fillStyle = onDark ? "rgba(255,250,243,0.28)" : "rgba(124,61,6,0.18)";
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = onDark ? REEL_COLORS.cream : REEL_COLORS.terracotta;
  roundRect(ctx, x, y, Math.max(h, w * Math.min(1, Math.max(0, fraction))), h, h / 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Scene painters
// ---------------------------------------------------------------------------

function titleFontSize(title: string): number {
  const n = title.length;
  if (n <= 18) return 118;
  if (n <= 30) return 96;
  if (n <= 48) return 78;
  if (n <= 70) return 64;
  return 54;
}

function drawCoverScene(
  ctx: CanvasRenderingContext2D,
  scene: Extract<ReelScene, { kind: "cover" }>,
  images: LoadedImages,
  progress: number,
  reducedMotion: boolean,
): void {
  const img = scene.imageUrl ? images.get(scene.imageUrl) : undefined;
  const onDark = Boolean(img);
  if (img) {
    const zoom = reducedMotion ? 1.02 : 1 + 0.08 * progress;
    drawCover(ctx, img, 0, 0, W, H, zoom);
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, H, [
      [0, "rgba(36,19,9,0.62)"],
      [0.45, "rgba(36,19,9,0.28)"],
      [1, "rgba(36,19,9,0.92)"],
    ]);
    ctx.fillRect(0, 0, W, H);
  } else {
    fillBackground(ctx);
    ctx.fillStyle = linearGradient(ctx, 0, 0, W, H, [
      [0, "rgba(180,83,9,0.14)"],
      [1, "rgba(180,83,9,0.04)"],
    ]);
    ctx.fillRect(0, 0, W, H);
  }

  drawWordmark(ctx, MARGIN, 120, onDark);

  const { alpha, dy } = entrance(progress, reducedMotion);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, dy);

  ctx.fillStyle = onDark ? REEL_COLORS.cream : REEL_COLORS.terracottaDeep;
  const fs = titleFontSize(scene.title);
  ctx.font = `600 ${fs}px ${displayFont()}`;
  const lines = wrapText(ctx, scene.title, CONTENT_W).slice(0, 4);
  const lineH = fs * 1.06;
  let baseY = H - 360 - (lines.length - 1) * lineH;
  for (const line of lines) {
    ctx.fillText(line, MARGIN, baseY);
    baseY += lineH;
  }

  let cursor = baseY + 20;
  cursor = drawChips(ctx, scene.chips, MARGIN, cursor, onDark);

  if (scene.byline) {
    ctx.font = `600 34px ${bodyFont()}`;
    ctx.fillStyle = onDark ? "rgba(255,250,243,0.92)" : REEL_COLORS.muted;
    ctx.fillText(scene.byline, MARGIN, cursor + 60);
  }
  ctx.restore();
}

function drawIngredientsScene(
  ctx: CanvasRenderingContext2D,
  scene: Extract<ReelScene, { kind: "ingredients" }>,
  images: LoadedImages,
  progress: number,
  reducedMotion: boolean,
): void {
  const img = scene.imageUrl ? images.get(scene.imageUrl) : undefined;
  fillBackground(ctx);
  // A soft photo band up top for warmth, if we have the cover.
  if (img) {
    const bandH = 520;
    const zoom = reducedMotion ? 1.02 : 1 + 0.05 * progress;
    drawCover(ctx, img, 0, 0, W, bandH, zoom);
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, bandH, [
      [0, "rgba(36,19,9,0.28)"],
      [1, REEL_COLORS.cream],
    ]);
    ctx.fillRect(0, 0, W, bandH);
  }

  drawWordmark(ctx, MARGIN, img ? 120 : 140, Boolean(img));

  const { alpha, dy } = entrance(progress, reducedMotion);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, dy);

  const top = img ? 620 : 400;
  ctx.fillStyle = REEL_COLORS.terracotta;
  roundRect(ctx, MARGIN, top, 96, 8, 4);
  ctx.fill();

  ctx.fillStyle = REEL_COLORS.terracottaDeep;
  ctx.font = `600 84px ${displayFont()}`;
  ctx.fillText(scene.heading, MARGIN, top + 96);

  let y = top + 190;
  ctx.font = `600 44px ${bodyFont()}`;
  const rowGap = 26;
  for (const item of scene.items) {
    ctx.fillStyle = REEL_COLORS.terracotta;
    ctx.beginPath();
    ctx.arc(MARGIN + 14, y - 16, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = REEL_COLORS.ink;
    const endY = drawParagraph(
      ctx,
      item.text + (item.optional ? "  (optional)" : ""),
      MARGIN + 52,
      y,
      CONTENT_W - 52,
      54,
      2,
    );
    y = endY + rowGap;
  }
  ctx.restore();
}

function drawStepScene(
  ctx: CanvasRenderingContext2D,
  scene: Extract<ReelScene, { kind: "step" }>,
  images: LoadedImages,
  progress: number,
  reducedMotion: boolean,
): void {
  const img = scene.imageUrl ? images.get(scene.imageUrl) : undefined;
  fillBackground(ctx);

  if (img) {
    const bandH = 900;
    const zoom = reducedMotion ? 1.02 : 1 + 0.06 * progress;
    drawCover(ctx, img, 0, 0, W, bandH, zoom);
    ctx.fillStyle = linearGradient(ctx, 0, bandH - 400, 0, bandH, [
      [0, "rgba(255,250,243,0)"],
      [1, REEL_COLORS.cream],
    ]);
    ctx.fillRect(0, bandH - 400, W, 400);
  }

  const { alpha, dy } = entrance(progress, reducedMotion);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, dy);

  const top = img ? 980 : 460;

  // Step badge: "Step 3 / 5".
  ctx.font = `800 40px ${bodyFont()}`;
  const badge = `STEP ${scene.step.number} / ${scene.step.totalSteps}`;
  const badgeW = ctx.measureText(badge).width + 60;
  ctx.fillStyle = REEL_COLORS.terracotta;
  roundRect(ctx, MARGIN, top, badgeW, 74, 37);
  ctx.fill();
  ctx.fillStyle = REEL_COLORS.cream;
  ctx.textBaseline = "middle";
  ctx.fillText(badge, MARGIN + 30, top + 39);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = REEL_COLORS.ink;
  ctx.font = `600 60px ${displayFont()}`;
  drawParagraph(ctx, scene.step.instruction, MARGIN, top + 190, CONTENT_W, 76, 8);

  ctx.restore();

  if (!img) {
    drawWordmark(ctx, MARGIN, 140, false);
  }
}

function drawOutroScene(
  ctx: CanvasRenderingContext2D,
  scene: Extract<ReelScene, { kind: "outro" }>,
  progress: number,
  reducedMotion: boolean,
): void {
  ctx.fillStyle = linearGradient(ctx, 0, 0, W, H, [
    [0, REEL_COLORS.terracotta],
    [1, REEL_COLORS.terracottaDeep],
  ]);
  ctx.fillRect(0, 0, W, H);

  const { alpha, dy } = entrance(progress, reducedMotion);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, dy);

  // Centered wordmark tile.
  const tile = 150;
  const tx = (W - tile) / 2;
  const ty = H / 2 - 340;
  ctx.fillStyle = REEL_COLORS.cream;
  roundRect(ctx, tx, ty, tile, tile, 42);
  ctx.fill();
  ctx.fillStyle = REEL_COLORS.terracottaDeep;
  ctx.font = `600 96px ${displayFont()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("H", W / 2, ty + tile / 2 + 4);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = REEL_COLORS.cream;
  ctx.font = `800 60px ${bodyFont()}`;
  ctx.fillText("Heirloom", W / 2, ty + tile + 110);

  ctx.font = `600 78px ${displayFont()}`;
  const lines = wrapText(ctx, scene.headline, CONTENT_W).slice(0, 3);
  let hy = H / 2 + 40;
  for (const line of lines) {
    ctx.fillText(line, W / 2, hy);
    hy += 92;
  }

  ctx.font = `600 40px ${bodyFont()}`;
  ctx.fillStyle = "rgba(255,250,243,0.9)";
  ctx.fillText(scene.siteUrl, W / 2, H - 200);

  ctx.textAlign = "left";
  ctx.restore();
}

/** Paint a single frame for the scene visible at `elapsedMs`. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  scenes: ReelScene[],
  images: LoadedImages,
  elapsedMs: number,
  reducedMotion: boolean,
): void {
  const total = totalDurationMs(scenes);
  const clamped = Math.min(Math.max(0, elapsedMs), Math.max(0, total - 1));
  const at = sceneAtTime(scenes, clamped) ?? {
    index: scenes.length - 1,
    scene: scenes[scenes.length - 1]!,
    progress: 1,
  };
  const { scene, progress } = at;

  ctx.clearRect(0, 0, W, H);
  switch (scene.kind) {
    case "cover":
      drawCoverScene(ctx, scene, images, progress, reducedMotion);
      break;
    case "ingredients":
      drawIngredientsScene(ctx, scene, images, progress, reducedMotion);
      break;
    case "step":
      drawStepScene(ctx, scene, images, progress, reducedMotion);
      break;
    case "outro":
      drawOutroScene(ctx, scene, progress, reducedMotion);
      break;
  }

  if (!reducedMotion && scene.kind !== "outro") {
    const onDark =
      scene.kind === "cover" && "imageUrl" in scene && Boolean(scene.imageUrl);
    drawProgressBar(ctx, clamped / Math.max(1, total), onDark);
  }
}

/** Draw a single representative still (the cover) — used for the reduced-motion poster. */
export function drawPoster(
  ctx: CanvasRenderingContext2D,
  scenes: ReelScene[],
  images: LoadedImages,
): void {
  drawFrame(ctx, scenes, images, 0, true);
}

// ---------------------------------------------------------------------------
// Preview player (looping animation for the in-app dialog)
// ---------------------------------------------------------------------------

export type PreviewHandle = { stop: () => void };

/** Animate the reel on a loop until `.stop()` is called. */
export function playPreview(
  canvas: HTMLCanvasElement,
  scenes: ReelScene[],
  images: LoadedImages,
): PreviewHandle {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { stop: () => undefined };
  const total = totalDurationMs(scenes);
  let raf = 0;
  let start = performance.now();
  let stopped = false;

  const tick = (now: number) => {
    if (stopped) return;
    let elapsed = now - start;
    if (elapsed >= total) {
      start = now;
      elapsed = 0;
    }
    drawFrame(ctx, scenes, images, elapsed, false);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}

// ---------------------------------------------------------------------------
// Recording (canvas -> webm via MediaRecorder)
// ---------------------------------------------------------------------------

/** True when this browser can capture a canvas to a video file. */
export function canRecordReel(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

function pickMimeType(): string | null {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export type RecordResult = { blob: Blob; mimeType: string };

export type RecordOptions = {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

/**
 * Render the whole reel to an offscreen canvas and capture it to a webm blob.
 * Animations play at full motion in the exported file regardless of the user's
 * reduced-motion preference (the preference only governs the on-screen preview).
 */
export function recordReel(
  scenes: ReelScene[],
  images: LoadedImages,
  options: RecordOptions = {},
): Promise<RecordResult> {
  return new Promise((resolve, reject) => {
    if (!canRecordReel()) {
      reject(new Error("Video recording isn't supported in this browser."));
      return;
    }
    const mimeType = pickMimeType();
    if (!mimeType) {
      reject(new Error("This browser can't encode webm video."));
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Couldn't get a drawing context."));
      return;
    }

    const total = totalDurationMs(scenes);
    const stream = canvas.captureStream(REEL_FPS);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 6_000_000,
    });
    const chunks: BlobPart[] = [];
    let raf = 0;
    let finished = false;

    const cleanup = () => {
      cancelAnimationFrame(raf);
      for (const track of stream.getTracks()) track.stop();
    };

    const abort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      if (recorder.state !== "inactive") recorder.stop();
      reject(new DOMException("Recording cancelled", "AbortError"));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        abort();
        return;
      }
      options.signal.addEventListener("abort", abort, { once: true });
    }

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
    };
    recorder.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("Recording failed."));
    };

    const start = performance.now();
    const tick = (now: number) => {
      if (finished) return;
      const elapsed = now - start;
      const fraction = Math.min(1, elapsed / total);
      drawFrame(ctx, scenes, images, Math.min(elapsed, total - 1), false);
      options.onProgress?.(fraction);
      if (elapsed >= total) {
        if (recorder.state !== "inactive") recorder.stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    recorder.start();
    raf = requestAnimationFrame(tick);
  });
}
