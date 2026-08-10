import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntlWrapper } from "~/test/intl";
import esMessages from "~/messages/es.json";

// Force the "Cloudinary not configured" branch deterministically, regardless of
// the machine's real env, so the degraded URL-input path is what renders.
vi.mock("~/env", () => ({
  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "",
    NEXT_PUBLIC_CLOUDINARY_API_KEY: "",
  },
}));

import { ImageUploadField } from "./image-upload";

/**
 * These render in Spanish on purpose. An English assertion would still pass if
 * the field reverted to hardcoded strings, so it would not test the property
 * that matters.
 */
function SpanishWrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlWrapper locale="es" messages={esMessages}>
      {children}
    </IntlWrapper>
  );
}

afterEach(() => cleanup());

const src = readFileSync(
  resolve(process.cwd(), "src/components/ui/image-upload.tsx"),
  "utf8",
);

/**
 * The picker export, its module, and the Cloudinary package — named once each
 * so the negative assertions below can be anchored to something real (#729).
 *
 * `PICKER_MODULE` is a `~/`-prefixed alias, so the anchor rewrites it to a path
 * under `src/`; that keeps the alias itself load-bearing rather than letting a
 * stale one pass unnoticed.
 */
const PICKER_EXPORT = "MediaPicker";
const PICKER_MODULE = "~/components/ui/media-picker";
const CLOUDINARY_PKG = "next-cloudinary";

describe("image-upload lazy picker (#201, #656)", () => {
  it("names a picker export and package that exist, so the bans below cannot rot", () => {
    // Anchors for the two negative assertions in the next test. A static import
    // of the picker or of Cloudinary coexists with the dynamic import — that
    // coexistence is exactly the regression — so the positive there anchors
    // nothing, and a typo in either forbidden literal would pass forever.
    const pickerSrc = readFileSync(
      resolve(process.cwd(), `src/${PICKER_MODULE.slice(2)}.tsx`),
      "utf8",
    );
    expect(
      pickerSrc,
      `"${PICKER_MODULE}" does not export ${PICKER_EXPORT}, so the check banning a static import of it can never fire. If it was renamed, update these constants; if misspelled, fix them.`,
    ).toContain(`export function ${PICKER_EXPORT}(`);

    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(
      Object.keys(pkg.dependencies ?? {}),
      `"${CLOUDINARY_PKG}" is not a dependency, so the check banning an import of it can never fire.`,
    ).toContain(CLOUDINARY_PKG);
  });

  it("imports the picker dialog as a dynamic (code-split) chunk", () => {
    expect(src).toMatch(
      new RegExp(
        `dynamic\\(\\s*\\(\\)\\s*=>\\s*\\n?\\s*import\\("${PICKER_MODULE}"\\)`,
      ),
    );
    // No eager top-level value import of the dialog (which in turn owns the
    // heavy Cloudinary widget), so neither reaches first-load JS.
    expect(src).not.toMatch(
      new RegExp(
        `import\\s*\\{[^}]*${PICKER_EXPORT}[^}]*\\}\\s*from\\s*"${PICKER_MODULE}"`,
      ),
    );
    expect(src).not.toMatch(new RegExp(`from\\s*"${CLOUDINARY_PKG}"`));
  });

  it("degrades to a plain URL input without mounting the widget when Cloudinary is unconfigured", () => {
    render(
      <ImageUploadField value="" onChange={vi.fn()} label="Cover photo" />,
      { wrapper: SpanishWrapper },
    );

    // The URL fallback input is present…
    expect(screen.getByLabelText("URL de Cover photo")).toBeInTheDocument();
    // …and the upload dropzone (which is what mounts the dynamic widget) is not.
    expect(screen.queryByRole("button", { name: /sube una foto/i })).toBeNull();
  });
});

describe("broken image fallback", () => {
  it("swaps the broken-image glyph for a readable fallback and re-surfaces the URL input when a pasted image fails to load", () => {
    render(
      <ImageUploadField
        value="https://example.invalid/nope.png"
        onChange={vi.fn()}
        label="Cover photo"
      />,
      { wrapper: SpanishWrapper },
    );

    const img = screen.getByAltText("Vista previa de la foto elegida");
    // While the image is (optimistically) loading, the URL input is hidden.
    expect(screen.queryByLabelText("URL de Cover photo")).toBeNull();

    fireEvent.error(img);

    // A human-readable message replaces the browser's broken-image icon…
    expect(
      screen.getByText(/no se pudo cargar la imagen/i),
    ).toBeInTheDocument();
    // …and the URL input returns so the link can be corrected inline.
    expect(screen.getByLabelText("URL de Cover photo")).toBeInTheDocument();
  });
});
