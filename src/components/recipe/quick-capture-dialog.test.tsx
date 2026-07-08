import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { QuickCaptureDialog } from "./quick-capture-dialog";
import { createRecipeAction } from "~/server/recipes/actions";

type CreateResult =
  | { ok: true; id: string; slug: string | null }
  | { ok: false; error: string };

vi.mock("~/server/recipes/actions", () => ({
  createRecipeAction: vi.fn<(input: unknown) => Promise<CreateResult>>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: () => undefined,
    error: () => undefined,
  },
}));

// Avoid pulling the Cloudinary widget + env into the jsdom test.
vi.mock("~/components/ui/image-upload", () => ({
  ImageUploadField: () => null,
}));

const mockedCreate = vi.mocked(createRecipeAction);

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openDialog() {
  const user = userEvent.setup();
  render(<QuickCaptureDialog />);
  await user.click(screen.getByRole("button", { name: /quick add/i }));
  return user;
}

describe("QuickCaptureDialog (#389)", () => {
  it("requires a title before saving", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/title/i);
  });

  it("saves a draft with the freeform text preserved in notes", async () => {
    const user = await openDialog();
    mockedCreate.mockResolvedValue({ ok: true, id: "r9", slug: "grandmas-meatballs" });

    await user.type(screen.getByLabelText("Title"), "Grandma's meatballs");
    await user.type(
      screen.getByLabelText(/ingredients & steps/i),
      "1 lb beef\nMix and bake.",
    );
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Grandma's meatballs",
        notes: "1 lb beef\nMix and bake.",
        status: "draft",
        visibility: "private",
        ingredients: [],
        steps: [],
      }),
    );

    // Offers a one-tap path into the full editor.
    const finish = await screen.findByRole("link", { name: /finish in full editor/i });
    expect(finish).toHaveAttribute("href", "/recipes/grandmas-meatballs/edit");
  });

  it("falls back to the id in the editor link when there is no slug", async () => {
    const user = await openDialog();
    mockedCreate.mockResolvedValue({ ok: true, id: "r10", slug: null });

    await user.type(screen.getByLabelText("Title"), "Untitled dump");
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    const finish = await screen.findByRole("link", { name: /finish in full editor/i });
    expect(finish).toHaveAttribute("href", "/recipes/r10/edit");
  });

  it("surfaces a server error", async () => {
    const user = await openDialog();
    mockedCreate.mockResolvedValue({ ok: false, error: "Something broke" });

    await user.type(screen.getByLabelText("Title"), "Meatballs");
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Something broke"),
    );
  });
});
