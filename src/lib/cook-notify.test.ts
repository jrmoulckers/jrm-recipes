import { describe, expect, it, vi } from "vitest";

import {
  buildCookTimerNotification,
  cookTimerNotificationUrl,
  matchesCookClient,
  requestTimerNotificationPermission,
  shouldSendTimerNotification,
} from "./cook-notify";

describe("cookTimerNotificationUrl", () => {
  it("points at the recipe's Cook Mode route", () => {
    expect(cookTimerNotificationUrl("apple-pie")).toBe(
      "/recipes/apple-pie/cook",
    );
  });
});

describe("buildCookTimerNotification", () => {
  it("names the step in the title and the recipe in the body", () => {
    const { title, options } = buildCookTimerNotification({
      stepNumber: 3,
      section: "Sauce",
      recipeTitle: "Grandma's Ragu",
      recipeSlug: "grandmas-ragu",
      stepId: "step-3",
    });
    expect(title).toBe("Step 3 timer is done");
    expect(options.body).toBe("Grandma's Ragu · Sauce");
    expect(options.data).toEqual({
      url: "/recipes/grandmas-ragu/cook",
      type: "cook-timer",
    });
  });

  it("falls back to just the recipe title when the step has no section", () => {
    const { options } = buildCookTimerNotification({
      stepNumber: 1,
      section: null,
      recipeTitle: "Focaccia",
      recipeSlug: "focaccia",
      stepId: "step-1",
    });
    expect(options.body).toBe("Focaccia");
  });

  it("tags per step so a re-run replaces rather than stacks", () => {
    const first = buildCookTimerNotification({
      stepNumber: 1,
      section: null,
      recipeTitle: "Focaccia",
      recipeSlug: "focaccia",
      stepId: "step-1",
    });
    const second = buildCookTimerNotification({
      stepNumber: 2,
      section: null,
      recipeTitle: "Focaccia",
      recipeSlug: "focaccia",
      stepId: "step-2",
    });
    expect(first.options.tag).not.toBe(second.options.tag);
    expect(first.options.tag).toContain("focaccia");
    expect(first.options.renotify).toBe(true);
  });
});

describe("shouldSendTimerNotification", () => {
  it("fires only when supported, granted, and the tab is hidden", () => {
    expect(
      shouldSendTimerNotification({
        supported: true,
        permission: "granted",
        documentHidden: true,
      }),
    ).toBe(true);
  });

  it("stays quiet in the foreground (tone + toast already alert)", () => {
    expect(
      shouldSendTimerNotification({
        supported: true,
        permission: "granted",
        documentHidden: false,
      }),
    ).toBe(false);
  });

  it("stays quiet when unsupported or not granted", () => {
    expect(
      shouldSendTimerNotification({
        supported: false,
        permission: "granted",
        documentHidden: true,
      }),
    ).toBe(false);
    expect(
      shouldSendTimerNotification({
        supported: true,
        permission: "denied",
        documentHidden: true,
      }),
    ).toBe(false);
    expect(
      shouldSendTimerNotification({
        supported: true,
        permission: "default",
        documentHidden: true,
      }),
    ).toBe(false);
  });
});

describe("requestTimerNotificationPermission", () => {
  it("returns 'denied' when notifications are unsupported", async () => {
    await expect(requestTimerNotificationPermission(undefined)).resolves.toBe(
      "denied",
    );
  });

  it("prompts only when the permission is still default", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    await expect(
      requestTimerNotificationPermission({
        permission: "default",
        requestPermission,
      }),
    ).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("respects a prior grant or denial without prompting again", async () => {
    const requestPermission = vi.fn();
    await expect(
      requestTimerNotificationPermission({
        permission: "granted",
        requestPermission,
      }),
    ).resolves.toBe("granted");
    await expect(
      requestTimerNotificationPermission({
        permission: "denied",
        requestPermission,
      }),
    ).resolves.toBe("denied");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("degrades to the current permission if the request throws", async () => {
    const requestPermission = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(
      requestTimerNotificationPermission({
        permission: "default",
        requestPermission,
      }),
    ).resolves.toBe("default");
  });
});

describe("matchesCookClient", () => {
  it("matches by pathname, ignoring query and hash", () => {
    expect(
      matchesCookClient(
        "https://heirloom.app/recipes/ragu/cook?step=2#timer",
        "https://heirloom.app/recipes/ragu/cook",
      ),
    ).toBe(true);
  });

  it("does not match a different recipe or route", () => {
    expect(
      matchesCookClient(
        "https://heirloom.app/recipes/focaccia/cook",
        "https://heirloom.app/recipes/ragu/cook",
      ),
    ).toBe(false);
    expect(
      matchesCookClient(
        "https://heirloom.app/recipes/ragu",
        "https://heirloom.app/recipes/ragu/cook",
      ),
    ).toBe(false);
  });

  it("returns false for an unparseable client URL", () => {
    expect(matchesCookClient("not a url", "/recipes/ragu/cook")).toBe(false);
  });
});
