import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CloudinaryImage } from "./cloudinary-image";

afterEach(() => {
  cleanup();
});

const CLOUD =
  "https://res.cloudinary.com/heirloom/image/upload/v1699999999/heirloom/cover.jpg";

describe("CloudinaryImage", () => {
  it("serves Cloudinary sources straight from the CDN with edge transforms", () => {
    const { container } = render(
      <CloudinaryImage src={CLOUD} alt="" width={640} height={480} />,
    );

    const img = container.querySelector("img");
    const src = img?.getAttribute("src") ?? "";
    expect(src).toContain("res.cloudinary.com");
    expect(src).toContain("f_auto,q_auto,c_limit,w_");
    // No proxy hop through Vercel's optimizer for Cloudinary assets.
    expect(src).not.toContain("/_next/image");
  });

  it("keeps non-Cloudinary sources on the default Next optimizer", () => {
    const { container } = render(
      <CloudinaryImage
        src="https://img.test/photo.jpg"
        alt=""
        width={640}
        height={480}
      />,
    );

    const img = container.querySelector("img");
    const src = img?.getAttribute("src") ?? "";
    expect(src).toContain("/_next/image");
    expect(src).toContain("img.test");
  });
});
