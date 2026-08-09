import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as React from "react";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IntlWrapper } from "~/test/intl";
import esMessages from "~/messages/es.json";

// Cloudinary configured, so all three tabs render.
vi.mock("~/env", () => ({
  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "demo",
    NEXT_PUBLIC_CLOUDINARY_API_KEY: "key",
  },
}));

// The real widget loads a remote script; the picker only needs the render-prop
// contract, so stand in for it.
vi.mock("next-cloudinary", () => ({
  CldUploadWidget: ({
    children,
  }: {
    children: (arg: { open: () => void }) => React.ReactNode;
  }) => <>{children({ open: () => undefined })}</>,
}));

// Hoisted so the `vi.mock` factory (which is lifted above the imports) can
// reference these without a temporal-dead-zone error.
const { listAssetsAction, recordUploadAction, updateAltTextAction } =
  vi.hoisted(() => ({
    listAssetsAction: vi.fn(),
    recordUploadAction: vi.fn(),
    updateAltTextAction: vi.fn(),
  }));

vi.mock("~/server/media/actions", () => ({
  listAssetsAction,
  recordUploadAction,
  updateAltTextAction,
}));

import { MediaPicker } from "./media-picker";

/**
 * Rendered in Spanish on purpose: an English assertion would still pass if the
 * picker reverted to hardcoded strings, so it would not test what matters.
 */
function SpanishWrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlWrapper locale="es" messages={esMessages}>
      {children}
    </IntlWrapper>
  );
}

function asset(id: string, altText: string | null) {
  return {
    id,
    url: `https://res.cloudinary.com/demo/image/upload/${id}.jpg`,
    altText,
  };
}

function renderPicker(onChange = vi.fn()) {
  render(
    <MediaPicker
      open
      onOpenChange={vi.fn()}
      value=""
      onChange={onChange}
      folder="heirloom"
    />,
    { wrapper: SpanishWrapper },
  );
  return onChange;
}

/** Open "Your photos" and wait for the grid to settle. */
async function openLibrary(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Tus fotos" }));
  return await screen.findByRole("radiogroup", { name: "Tus fotos" });
}

beforeEach(() => {
  listAssetsAction.mockReset();
  recordUploadAction.mockReset();
  updateAltTextAction.mockReset();
  listAssetsAction.mockResolvedValue({
    ok: true,
    page: {
      assets: [asset("a1", "Pan de plátano"), asset("a2", null)],
      nextCursor: null,
    },
  });
  updateAltTextAction.mockResolvedValue({ ok: true });
});

afterEach(() => cleanup());

describe("media picker library tab (#656)", () => {
  it("does not load the library until the tab is opened", async () => {
    const user = userEvent.setup();
    renderPicker();

    expect(listAssetsAction).not.toHaveBeenCalled();

    await openLibrary(user);
    expect(listAssetsAction).toHaveBeenCalledTimes(1);
  });

  it("selects an existing photo without uploading anything", async () => {
    const user = userEvent.setup();
    const onChange = renderPicker();
    const grid = await openLibrary(user);

    await user.click(
      within(grid).getByRole("radio", { name: "Pan de plátano" }),
    );

    expect(onChange).toHaveBeenCalledWith({
      url: "https://res.cloudinary.com/demo/image/upload/a1.jpg",
      assetId: "a1",
    });
    expect(recordUploadAction).not.toHaveBeenCalled();
  });

  it("names every thumbnail, falling back when a photo has no description", async () => {
    const user = userEvent.setup();
    renderPicker();
    const grid = await openLibrary(user);

    expect(
      within(grid).getByRole("radio", { name: "Foto sin descripción" }),
    ).toBeInTheDocument();
  });

  it("moves between thumbnails with the arrow keys", async () => {
    const user = userEvent.setup();
    renderPicker();
    const grid = await openLibrary(user);

    const [first, second] = within(grid).getAllByRole("radio");
    // Focus moves the roving tabindex, which is a state update.
    act(() => first!.focus());
    expect(first).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(second).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(first).toHaveFocus();
  });
});

describe("media picker alt text (#125)", () => {
  it("round-trips the selected photo's description to the library", async () => {
    const user = userEvent.setup();
    renderPicker();
    const grid = await openLibrary(user);

    await user.click(
      within(grid).getByRole("radio", { name: "Pan de plátano" }),
    );

    const field = screen.getByLabelText("Descripción de la foto");
    // The chosen photo's stored description is what the field starts from.
    expect(field).toHaveValue("Pan de plátano");

    await user.clear(field);
    await user.type(field, "Pan tibio");
    await user.click(
      screen.getByRole("button", { name: "Guardar descripción" }),
    );

    await waitFor(() =>
      expect(updateAltTextAction).toHaveBeenCalledWith({
        id: "a1",
        altText: "Pan tibio",
      }),
    );
    expect(screen.getByText("Descripción guardada")).toBeInTheDocument();
  });

  it("keeps the description field unavailable until a stored photo is chosen", () => {
    renderPicker();
    expect(screen.getByLabelText("Descripción de la foto")).toBeDisabled();
  });
});

describe("media picker link tab", () => {
  it("accepts a pasted URL with no library asset behind it", async () => {
    const user = userEvent.setup();
    const onChange = renderPicker();

    await user.click(screen.getByRole("tab", { name: "Enlace" }));
    await user.type(screen.getByLabelText("URL de la imagen"), "h");

    expect(onChange).toHaveBeenLastCalledWith({ url: "h", assetId: null });
  });
});

describe("media picker upload tab", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/components/ui/media-picker.tsx"),
    "utf8",
  );

  it("keeps the Cloudinary widget in its own async chunk (#201)", () => {
    expect(src).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\("next-cloudinary"\)/);
    expect(src).not.toMatch(
      /import\s*\{[^}]*CldUploadWidget[^}]*\}\s*from\s*"next-cloudinary"/,
    );
  });

  it("records the upload once and never meters storage twice", () => {
    // `recordUploadAction` meters storage itself, so the old direct
    // `recordStorageUsageAction` call must be gone or the cap is billed twice.
    expect(src).toMatch(/recordUploadAction\(/);
    expect(src).not.toMatch(/recordStorageUsageAction\(/);
  });
});
