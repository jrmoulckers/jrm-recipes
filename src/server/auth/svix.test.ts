import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifySvixSignature } from "~/server/auth/svix";

const SECRET = "whsec_" + Buffer.from("super-secret-signing-key").toString("base64");

/** Sign a payload exactly the way Svix (and Clerk) would, for test fixtures. */
function sign(payload: string, id: string, timestamp: string, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  return `v1,${signature}`;
}

describe("verifySvixSignature", () => {
  const now = 1_700_000_000_000;
  const timestamp = String(Math.floor(now / 1000));
  const id = "msg_123";
  const payload = JSON.stringify({ type: "user.updated", data: { id: "u1" } });

  it("accepts a correctly signed payload", () => {
    const signature = sign(payload, id, timestamp);
    expect(
      verifySvixSignature(SECRET, { id, timestamp, signature }, payload, now),
    ).toBe(true);
  });

  it("accepts when the header carries multiple signatures", () => {
    const signature = `v1,invalidsig ${sign(payload, id, timestamp)}`;
    expect(
      verifySvixSignature(SECRET, { id, timestamp, signature }, payload, now),
    ).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const signature = sign(payload, id, timestamp);
    expect(
      verifySvixSignature(
        SECRET,
        { id, timestamp, signature },
        payload + "x",
        now,
      ),
    ).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const other = "whsec_" + Buffer.from("different-key").toString("base64");
    const signature = sign(payload, id, timestamp, other);
    expect(
      verifySvixSignature(SECRET, { id, timestamp, signature }, payload, now),
    ).toBe(false);
  });

  it("rejects missing headers", () => {
    const signature = sign(payload, id, timestamp);
    expect(
      verifySvixSignature(SECRET, { id: null, timestamp, signature }, payload, now),
    ).toBe(false);
    expect(
      verifySvixSignature(SECRET, { id, timestamp: null, signature }, payload, now),
    ).toBe(false);
    expect(
      verifySvixSignature(SECRET, { id, timestamp, signature: null }, payload, now),
    ).toBe(false);
  });

  it("rejects a stale timestamp outside the tolerance window", () => {
    const staleTs = String(Math.floor(now / 1000) - 60 * 10);
    const signature = sign(payload, id, staleTs);
    expect(
      verifySvixSignature(
        SECRET,
        { id, timestamp: staleTs, signature },
        payload,
        now,
      ),
    ).toBe(false);
  });

  it("rejects a non-v1 signature scheme", () => {
    const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
    const raw = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${payload}`)
      .digest("base64");
    expect(
      verifySvixSignature(
        SECRET,
        { id, timestamp, signature: `v2,${raw}` },
        payload,
        now,
      ),
    ).toBe(false);
  });
});
