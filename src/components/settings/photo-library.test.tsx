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

import esMessages from "~/messages/es.json";
import { IntlWrapper } from "~/test/intl";
import { ConfirmProvider } from "~/components/ui/confirm-dialog";

const {
  deleteAssetAction,
  getAssetUsageAction,
  listAssetsAction,
  updateAltTextAction,
} = vi.hoisted(() => ({
  deleteAssetAction: vi.fn(),
  getAssetUsageAction: vi.fn(),
  listAssetsAction: vi.fn(),
  updateAltTextAction: vi.fn(),
}));

vi.mock("~/server/media/actions", () => ({
  deleteAssetAction,
  getAssetUsageAction,
  listAssetsAction,
  updateAltTextAction,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

import { PhotoLibrary, type LibraryAsset } from "./photo-library";

const assets: LibraryAsset[] = [
  {
    id: "a1",
    url: "https://res.cloudinary.com/demo/image/upload/a1.jpg",
    altText: "Pan de plátano",
    width: 1200,
    height: 800,
    bytes: 1024,
    createdAt: "2026-08-01T12:00:00.000Z",
  },
  {
    id: "a2",
    url: "https://res.cloudinary.com/demo/image/upload/a2.jpg",
    altText: null,
    width: 800,
    height: 800,
    bytes: 2048,
    createdAt: "2026-07-31T12:00:00.000Z",
  },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlWrapper locale="es" messages={esMessages}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </IntlWrapper>
  );
}

function renderLibrary() {
  return render(<PhotoLibrary initialAssets={assets} initialCursor={null} />, {
    wrapper: Wrapper,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAssetUsageAction.mockResolvedValue({
    ok: true,
    usage: {
      total: 2,
      bySurface: {
        recipes: 1,
        steps: 0,
        collections: 0,
        groups: 1,
        cookLog: 0,
        reviews: 0,
      },
    },
  });
});

afterEach(cleanup);

describe("PhotoLibrary", () => {
  it("moves through the photo grid with roving tabindex keys", async () => {
    const user = userEvent.setup();
    renderLibrary();

    const grid = screen.getByRole("listbox", { name: "Tus fotos" });
    const [first, second] = within(grid).getAllByRole("option");
    act(() => first!.focus());
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowRight}");
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("tabindex", "0");

    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
  });

  it("loads usage only for delete and names the photo and visible uses", async () => {
    const user = userEvent.setup();
    renderLibrary();

    expect(getAssetUsageAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Eliminar foto" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(getAssetUsageAction).toHaveBeenCalledOnce();
    expect(getAssetUsageAction).toHaveBeenCalledWith("a1");
    expect(
      within(dialog).getByText("¿Eliminar «Pan de plátano»?"),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("1 portada de receta, 1 grupo familiar");

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(deleteAssetAction).not.toHaveBeenCalled());
  });
});
