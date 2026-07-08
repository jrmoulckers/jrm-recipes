import { describe, expect, it } from "vitest";

import {
  DEFAULT_MESSAGES,
  DomainError,
  domainCodeOf,
  isDomainCode,
  messageForError,
  raise,
} from "./errors";

describe("DomainError", () => {
  it("carries a typed code and sets message to the code for legacy compatibility", () => {
    const err = new DomainError("FORBIDDEN");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toBe("FORBIDDEN");
    expect(err.name).toBe("DomainError");
  });

  it("raise() throws a DomainError with the given code", () => {
    expect(() => raise("NOT_FOUND")).toThrow(DomainError);
    expect(() => raise("NOT_FOUND")).toThrow("NOT_FOUND");
  });
});

describe("domainCodeOf", () => {
  it("reads the code from a DomainError", () => {
    expect(domainCodeOf(new DomainError("CONFLICT"))).toBe("CONFLICT");
  });

  it("reads a code from a legacy Error whose message is a code", () => {
    expect(domainCodeOf(new Error("EXPIRED"))).toBe("EXPIRED");
  });

  it("returns null for non-domain errors and non-errors", () => {
    expect(domainCodeOf(new Error("something human-readable"))).toBeNull();
    expect(domainCodeOf("FORBIDDEN")).toBeNull();
    expect(domainCodeOf(undefined)).toBeNull();
  });
});

describe("isDomainCode", () => {
  it("recognizes known codes only", () => {
    expect(isDomainCode("BAD_SNAPSHOT")).toBe(true);
    expect(isDomainCode("NOPE")).toBe(false);
    expect(isDomainCode(42)).toBe(false);
  });
});

describe("messageForError", () => {
  it("prefers a per-call override for a known code", () => {
    const msg = messageForError(
      new DomainError("FORBIDDEN"),
      { FORBIDDEN: "Only the owner can do that." },
      "fallback",
    );
    expect(msg).toBe("Only the owner can do that.");
  });

  it("falls back to the provided fallback for a known code without an override", () => {
    const msg = messageForError(new DomainError("CONFLICT"), {}, "fallback copy");
    expect(msg).toBe("fallback copy");
  });

  it("uses DEFAULT_MESSAGES for a known code with no override or fallback", () => {
    expect(messageForError(new DomainError("SELF_RATING"))).toBe(
      DEFAULT_MESSAGES.SELF_RATING,
    );
  });

  it("uses the fallback for unknown/non-domain errors", () => {
    expect(messageForError(new Error("weird"), {}, "please retry")).toBe(
      "please retry",
    );
  });

  it("uses a generic message for unknown errors with no fallback", () => {
    expect(messageForError(new Error("weird"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("works with legacy string-coded Errors too", () => {
    expect(
      messageForError(new Error("NOT_FOUND"), { NOT_FOUND: "Gone." }),
    ).toBe("Gone.");
  });
});
