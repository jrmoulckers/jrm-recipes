import { describe, expect, it } from "vitest";

import {
  IOS_SPLASH_DEVICES,
  iosSplashFileName,
  iosSplashMedia,
  iosSplashPixels,
  iosStartupImages,
} from "./ios-splash";

describe("ios splash config", () => {
  it("covers every device in both orientations", () => {
    const images = iosStartupImages();
    expect(images).toHaveLength(IOS_SPLASH_DEVICES.length * 2);
    // Every referenced url is a unique /icons/apple-splash-*.png asset.
    const urls = images.map((i) => i.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const { url } of images) {
      expect(url).toMatch(
        /^\/icons\/apple-splash-[\d-]+x-(portrait|landscape)\.png$/,
      );
    }
  });

  it("swaps pixel dimensions between orientations", () => {
    const device = { w: 393, h: 852, dpr: 3, label: "test" };
    expect(iosSplashPixels(device, "portrait")).toEqual({
      width: 1179,
      height: 2556,
    });
    expect(iosSplashPixels(device, "landscape")).toEqual({
      width: 2556,
      height: 1179,
    });
  });

  it("builds device-scoped media queries", () => {
    const device = { w: 430, h: 932, dpr: 3, label: "test" };
    expect(iosSplashMedia(device, "portrait")).toContain(
      "(device-width: 430px) and (device-height: 932px)",
    );
    expect(iosSplashMedia(device, "portrait")).toContain(
      "(-webkit-device-pixel-ratio: 3)",
    );
    expect(iosSplashMedia(device, "landscape")).toContain(
      "(orientation: landscape)",
    );
  });

  it("names files deterministically", () => {
    const device = { w: 768, h: 1024, dpr: 2, label: "test" };
    expect(iosSplashFileName(device, "portrait")).toBe(
      "apple-splash-768-1024-2x-portrait.png",
    );
  });
});
