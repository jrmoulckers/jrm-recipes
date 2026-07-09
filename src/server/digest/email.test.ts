import { describe, expect, it, vi } from "vitest";

import { type WeeklyDigest } from "./builder";
import { logEmailProvider, renderDigestEmail } from "./email";

function sampleDigest(overrides: Partial<WeeklyDigest> = {}): WeeklyDigest {
  return {
    periodDays: 7,
    since: new Date("2024-01-01T00:00:00Z"),
    totalNew: 2,
    totalUpdated: 1,
    groups: [
      {
        groupId: "g1",
        groupName: "The Moulckers",
        newRecipes: [
          { id: "r1", slug: "nonna-sauce", title: "Nonna's Sauce", authorName: "Ada" },
          { id: "r2", slug: "rye-bread", title: "Rye & Butter", authorName: null },
        ],
        updatedCount: 1,
      },
    ],
    ...overrides,
  };
}

describe("renderDigestEmail", () => {
  it("summarizes counts in the subject with pluralization", () => {
    const { subject } = renderDigestEmail(sampleDigest());
    expect(subject).toContain("2 new recipes");
  });

  it("uses singular wording for a single new recipe", () => {
    const digest = sampleDigest({
      totalNew: 1,
      groups: [
        {
          groupId: "g1",
          groupName: "Fam",
          newRecipes: [
            { id: "r1", slug: "s", title: "One", authorName: null },
          ],
          updatedCount: 0,
        },
      ],
      totalUpdated: 0,
    });
    expect(renderDigestEmail(digest).subject).toContain("1 new recipe ");
  });

  it("falls back to update counts when there are no new recipes", () => {
    const digest = sampleDigest({
      totalNew: 0,
      totalUpdated: 3,
      groups: [
        { groupId: "g1", groupName: "Fam", newRecipes: [], updatedCount: 3 },
      ],
    });
    expect(renderDigestEmail(digest).subject).toContain("3 recipe updates");
  });

  it("includes recipe titles, author, and links in both html and text", () => {
    const { html, text } = renderDigestEmail(sampleDigest());
    expect(html).toContain("Nonna&#39;s Sauce".replace("&#39;", "'"));
    expect(html).toContain("/recipes/nonna-sauce");
    expect(html).toContain("by Ada");
    expect(text).toContain("Nonna's Sauce by Ada");
    expect(text).toContain("/recipes/rye-bread");
    expect(text).toContain("1 other recipe was updated");
  });

  it("escapes html-unsafe characters in titles and group names", () => {
    const digest = sampleDigest({
      groups: [
        {
          groupId: "g1",
          groupName: "A & B <fam>",
          newRecipes: [
            {
              id: "r1",
              slug: "x",
              title: "<script>alert(1)</script>",
              authorName: null,
            },
          ],
          updatedCount: 0,
        },
      ],
      totalNew: 1,
      totalUpdated: 0,
    });
    const { html } = renderDigestEmail(digest);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B &lt;fam&gt;");
  });

  it("always includes a manage-preferences link", () => {
    const { html, text } = renderDigestEmail(sampleDigest());
    expect(html).toContain("/settings/notifications");
    expect(text).toContain("/settings/notifications");
  });
});

describe("logEmailProvider", () => {
  it("redacts the recipient address and never throws", async () => {
    const chunks: string[] = [];
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        chunks.push(String(chunk));
        return true;
      });
    await logEmailProvider.send({
      to: "grandma@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    spy.mockRestore();
    const logged = chunks.join(" ");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(logged).toContain("g***@example.com");
    expect(logged).not.toContain("grandma@example.com");
  });
});
