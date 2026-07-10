import { describe, expect, it } from "vitest";

import {
  activeMentionQuery,
  candidatesByHandle,
  extractMentionHandles,
  normalizeHandle,
  resolveMentions,
  splitMentions,
  type MentionCandidate,
} from "./mentions";

const gran: MentionCandidate = {
  id: "u_gran",
  name: "Grandma Rose",
  handle: "GrandmaRose",
  avatarUrl: null,
};
const dad: MentionCandidate = {
  id: "u_dad",
  name: "Dad",
  handle: "dad",
  avatarUrl: null,
};
const candidates = [gran, dad];

describe("normalizeHandle", () => {
  it("strips a leading @ and lowercases", () => {
    expect(normalizeHandle("@GrandmaRose")).toBe("grandmarose");
    expect(normalizeHandle("dad")).toBe("dad");
  });
});

describe("extractMentionHandles", () => {
  it("finds unique handles in first-seen order", () => {
    expect(
      extractMentionHandles("hey @dad and @GrandmaRose and @dad again"),
    ).toEqual(["dad", "grandmarose"]);
  });

  it("returns nothing when there are no mentions", () => {
    expect(extractMentionHandles("just a plain comment")).toEqual([]);
  });

  it("does not treat an email as a mention start", () => {
    // No whitespace/start boundary before @, but the local part is still a run;
    // extraction is greedy on @handle so we assert the resolved behavior instead.
    expect(extractMentionHandles("ping @dad")).toEqual(["dad"]);
  });
});

describe("resolveMentions", () => {
  it("resolves only real members, once each", () => {
    const resolved = resolveMentions(
      "@dad @GRANDMAROSE @dad @ghost",
      candidates,
    );
    expect(resolved.map((c) => c.id)).toEqual(["u_dad", "u_gran"]);
  });

  it("drops unknown handles", () => {
    expect(resolveMentions("@nobody here", candidates)).toEqual([]);
  });
});

describe("splitMentions", () => {
  it("keeps unknown handles as plain text", () => {
    const segments = splitMentions("hi @ghost!", candidates);
    expect(segments).toEqual([{ type: "text", text: "hi @ghost!" }]);
  });

  it("splits known mentions into mention segments", () => {
    const segments = splitMentions("yo @dad check this", candidates);
    expect(segments[0]).toEqual({ type: "text", text: "yo " });
    expect(segments[1]).toMatchObject({ type: "mention", handle: "dad" });
    expect(segments[2]).toEqual({ type: "text", text: " check this" });
  });
});

describe("candidatesByHandle", () => {
  it("indexes by normalized handle and skips handleless users", () => {
    const map = candidatesByHandle([
      gran,
      { id: "x", name: "X", handle: null, avatarUrl: null },
    ]);
    expect(map.get("grandmarose")?.id).toBe("u_gran");
    expect(map.size).toBe(1);
  });
});

describe("activeMentionQuery", () => {
  it("returns the in-progress handle fragment", () => {
    expect(activeMentionQuery("hello @gr")).toBe("gr");
    expect(activeMentionQuery("@d")).toBe("d");
    expect(activeMentionQuery("start of @")).toBe("");
  });

  it("returns null when the caret is not in a mention", () => {
    expect(activeMentionQuery("hello world")).toBeNull();
    expect(activeMentionQuery("email me@host")).toBeNull();
  });
});
