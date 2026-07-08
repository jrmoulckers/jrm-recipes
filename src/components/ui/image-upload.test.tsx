import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Force the "Cloudinary not configured" branch deterministically, regardless of
// the machine's real env, so the degraded URL-input path is what renders.
vi.mock("~/env", () => ({
  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "",
    NEXT_PUBLIC_CLOUDINARY_API_KEY: "",
  },
}));

import { ImageUploadField } from "./image-upload";

afterEach(() => cleanup());

const src = readFileSync(
  resolve(process.cwd(), "src/components/ui/image-upload.tsx"),
  "utf8",
);

describe("image-upload lazy widget (#201)", () => {
  it("imports the Cloudinary widget as a dynamic (code-split) chunk", () => {
    expect(src).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\("next-cloudinary"\)/);
    // No eager top-level value import of the heavy widget.
    expect(src).not.toMatch(/import\s*\{[^}]*CldUploadWidget[^}]*\}\s*from\s*"next-cloudinary"/);
  });

  it("degrades to a plain URL input without mounting the widget when Cloudinary is unconfigured", () => {
    render(
      <ImageUploadField value="" onChange={vi.fn()} label="Cover photo" />,
    );

    // The URL fallback input is present…
    expect(screen.getByLabelText("Cover photo URL")).toBeInTheDocument();
    // …and the upload dropzone (which is what mounts the dynamic widget) is not.
    expect(screen.queryByRole("button", { name: /upload a photo/i })).toBeNull();
  });
});
