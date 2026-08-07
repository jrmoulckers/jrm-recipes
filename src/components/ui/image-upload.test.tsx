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

describe("image-upload lazy widget (#201)", () => {
  it("imports the Cloudinary widget as a dynamic (code-split) chunk", () => {
    expect(src).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\("next-cloudinary"\)/);
    // No eager top-level value import of the heavy widget.
    expect(src).not.toMatch(
      /import\s*\{[^}]*CldUploadWidget[^}]*\}\s*from\s*"next-cloudinary"/,
    );
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
