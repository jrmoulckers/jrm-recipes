import { afterEach, describe, expect, it, vi } from "vitest";

import { createLogger, redactFields } from "./log";

/**
 * Capture everything the logger writes to stdout+stderr during `fn`, returned
 * as the joined raw text so tests can assert on the emitted JSON lines.
 */
function captureOutput(fn: () => void): string {
  const chunks: string[] = [];
  const record = (chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  };
  const out = vi.spyOn(process.stdout, "write").mockImplementation(record);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(record);
  try {
    fn();
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
  return chunks.join("");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("redactFields", () => {
  it("redacts sensitive keys wholesale", () => {
    const out = redactFields({
      CLERK_SECRET_KEY: "sk_live_abc123",
      DATABASE_URL: "postgresql://user:pw@host/db",
      authorization: "Bearer xyz",
      count: 3,
    });
    expect(out.CLERK_SECRET_KEY).toBe("[REDACTED]");
    expect(out.DATABASE_URL).toBe("[REDACTED]");
    expect(out.authorization).toBe("[REDACTED]");
    expect(out.count).toBe(3);
  });

  it("scrubs secret-shaped values under innocuous keys", () => {
    const out = redactFields({
      note: "connect via postgresql://admin:hunter2@db.example.com:5432/app please",
      key: "sk_live_deadbeefcafe",
    }) as { note: string; key: string };
    expect(out.note).not.toContain("hunter2");
    expect(out.note).toContain("[REDACTED]");
    expect(out.key).toBe("[REDACTED]");
  });

  it("handles nested structures, cycles, and errors without leaking", () => {
    const cyclic: Record<string, unknown> = { token: "abc" };
    cyclic.self = cyclic;
    const out = redactFields({
      nested: { password: "p@ss", ok: 1 },
      err: new Error("failed for postgresql://u:p@h/d"),
      cyclic,
    }) as Record<string, Record<string, unknown>>;
    expect(out.nested?.password).toBe("[REDACTED]");
    expect(out.nested?.ok).toBe(1);
    expect(JSON.stringify(out)).not.toContain("p@ss");
    expect(JSON.stringify(out)).not.toContain("://u:p@h");
  });
});

describe("createLogger", () => {
  it("emits a single JSON line with level, msg, and bound fields", () => {
    vi.stubEnv("LOG_LEVEL", "debug");
    const text = captureOutput(() => {
      createLogger({ scope: "test" }).info("hello", { recipeId: "r1" });
    });
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("hello");
    expect(entry.scope).toBe("test");
    expect(entry.recipeId).toBe("r1");
    expect(typeof entry.time).toBe("string");
  });

  it("suppresses lines below the configured level", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    const text = captureOutput(() => {
      const log = createLogger();
      log.info("quiet");
      log.debug("quieter");
      log.warn("loud");
    });
    expect(text).not.toContain("quiet");
    expect(text).toContain("loud");
  });

  it("never emits a secret passed through message or fields", () => {
    vi.stubEnv("LOG_LEVEL", "debug");
    const text = captureOutput(() => {
      createLogger().error("boom while using sk_live_supersecret999", {
        DATABASE_URL: "postgresql://user:topsecret@host:5432/db",
        headers: { authorization: "Bearer tok_abcdef123456" },
      });
    });
    expect(text).not.toContain("sk_live_supersecret999");
    expect(text).not.toContain("topsecret");
    expect(text).not.toContain("tok_abcdef123456");
    expect(text).toContain("[REDACTED]");
  });
});
