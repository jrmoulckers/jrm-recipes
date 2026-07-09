import { brand } from "~/config/brand";
import { log } from "~/lib/log";
import { absoluteUrl } from "~/lib/utils";
import { type WeeklyDigest } from "./builder";

/**
 * Weekly-digest email rendering + a pluggable provider seam (issue #354).
 *
 * `renderDigestEmail` is a pure function (brand-styled, inline-CSS HTML for
 * email clients + a plain-text fallback) so it can be unit-tested without a
 * network. Sending goes through a tiny `EmailProvider` interface; with no ESP
 * wired up the default is a log/no-op provider, exactly how analytics + storage
 * degrade when unconfigured — so the trigger endpoint never fails on a missing
 * provider. Swapping in a real ESP later is a one-function change.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function digestSubject(digest: WeeklyDigest): string {
  if (digest.totalNew > 0) {
    return `${plural(digest.totalNew, "new recipe", "new recipes")} in your ${brand.name} cookbooks this week`;
  }
  return `${plural(digest.totalUpdated, "recipe update", "recipe updates")} in your ${brand.name} cookbooks this week`;
}

/** Render a digest into an email payload. Pure — safe to unit test. */
export function renderDigestEmail(digest: WeeklyDigest): RenderedEmail {
  const subject = digestSubject(digest);

  const textLines: string[] = [
    `Here's what's new across your ${brand.name} family cookbooks:`,
    "",
  ];
  const groupBlocks: string[] = [];

  for (const group of digest.groups) {
    textLines.push(`${group.groupName}`);
    const items: string[] = [];
    for (const recipe of group.newRecipes) {
      const url = absoluteUrl(`/recipes/${recipe.slug}`);
      const by = recipe.authorName ? ` by ${recipe.authorName}` : "";
      textLines.push(`  • ${recipe.title}${by} — ${url}`);
      items.push(
        `<li style="margin:0 0 8px"><a href="${url}" style="color:${brand.themeColor};text-decoration:none;font-weight:600">${escapeHtml(
          recipe.title,
        )}</a>${recipe.authorName ? `<span style="color:#6b7280"> by ${escapeHtml(recipe.authorName)}</span>` : ""}</li>`,
      );
    }
    if (group.updatedCount > 0) {
      textLines.push(
        `  • ${plural(group.updatedCount, "other recipe was", "other recipes were")} updated`,
      );
      items.push(
        `<li style="margin:0 0 8px;color:#6b7280">${plural(group.updatedCount, "other recipe was", "other recipes were")} updated</li>`,
      );
    }
    textLines.push("");
    groupBlocks.push(
      `<h2 style="font-size:18px;margin:24px 0 8px">${escapeHtml(group.groupName)}</h2><ul style="padding-left:18px;margin:0">${items.join("")}</ul>`,
    );
  }

  const discoverUrl = absoluteUrl("/discover");
  const settingsUrl = absoluteUrl("/settings/notifications");

  const html = `<!doctype html><html><body style="margin:0;background:${brand.backgroundColor};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="font-size:22px;font-weight:700;color:${brand.themeColor}">${escapeHtml(brand.name)}</div>
  <p style="font-size:15px;line-height:1.5">Here's what's new across your family cookbooks this week.</p>
  ${groupBlocks.join("")}
  <p style="margin:28px 0 8px"><a href="${discoverUrl}" style="display:inline-block;background:${brand.themeColor};color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open ${escapeHtml(brand.name)}</a></p>
  <p style="font-size:12px;color:#9ca3af;margin-top:24px">You're getting this because you opted in to the weekly digest. <a href="${settingsUrl}" style="color:#9ca3af">Manage your email preferences</a>.</p>
</div></body></html>`;

  textLines.push(`Open ${brand.name}: ${discoverUrl}`);
  textLines.push("");
  textLines.push(
    `You're getting this because you opted in to the weekly digest. Manage preferences: ${settingsUrl}`,
  );

  return { subject, html, text: textLines.join("\n") };
}

export interface EmailMessage extends RenderedEmail {
  to: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Keep only the first character + domain so logs never carry a full address. */
function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * The default provider when no ESP is configured: it logs what it *would* have
 * sent (with a redacted recipient) instead of failing. This is the seam a real
 * provider slots into later.
 */
export const logEmailProvider: EmailProvider = {
  name: "log",
  async send(message) {
    log.info("digest: no email provider configured — would send", {
      subject: message.subject,
      to: redactEmail(message.to),
    });
  },
};

/** Resolve the active email provider. No ESP wired yet → log/no-op default. */
export function getEmailProvider(): EmailProvider {
  return logEmailProvider;
}
