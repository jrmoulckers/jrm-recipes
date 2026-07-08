import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fail, fromZodError, ok } from "~/server/action-result";

describe("action-result helpers", () => {
  it("ok() builds a bare success result", () => {
    expect(ok()).toEqual({ ok: true });
  });

  it("ok(data) spreads the payload onto the success result", () => {
    expect(ok({ id: "r1", slug: "risotto" })).toEqual({
      ok: true,
      id: "r1",
      slug: "risotto",
    });
  });

  it("fail() builds a failure result without field errors", () => {
    expect(fail("Nope")).toEqual({ ok: false, error: "Nope" });
  });

  it("fail() includes field errors when provided", () => {
    expect(fail("Bad", { name: ["Required"] })).toEqual({
      ok: false,
      error: "Bad",
      fieldErrors: { name: ["Required"] },
    });
  });

  it("fromZodError maps flattened field errors with a default message", () => {
    const schema = z.object({ name: z.string().min(1) });
    const parsed = schema.safeParse({ name: "" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const result = fromZodError(parsed.error);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Please fix the highlighted fields.");
    expect(result.fieldErrors?.name?.length).toBeGreaterThan(0);
  });

  it("fromZodError accepts a custom message", () => {
    const schema = z.object({ owner: z.string().min(1) });
    const parsed = schema.safeParse({ owner: "" });
    if (parsed.success) return;

    expect(fromZodError(parsed.error, "Choose an owner.").error).toBe(
      "Choose an owner.",
    );
  });
});
