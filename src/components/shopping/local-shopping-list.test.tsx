import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type LocalShoppingList as LocalList,
  useShoppingStore,
} from "~/lib/shopping-store";
import { DEFAULT_UNIT_PREFS } from "~/lib/units";
import { IntlWrapper } from "~/test/intl";
import { LocalShoppingList } from "./local-shopping-list";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

vi.mock("~/components/ui/confirm-dialog", () => ({
  useConfirm: () => async () => true,
}));

vi.mock("./shopping-list-view", () => ({
  ShoppingListView: ({ currentListId }: { currentListId: string }) => (
    <div data-testid="current-list">{currentListId}</div>
  ),
}));

const lists: LocalList[] = [
  {
    id: "default",
    name: "Neighborhood market",
    storeName: "QFC",
    isDefault: true,
    archived: false,
    items: [],
  },
  {
    id: "warehouse",
    name: "Bulk run",
    storeName: "Costco",
    isDefault: false,
    archived: false,
    items: [],
  },
  {
    id: "archived",
    name: "Old market",
    storeName: null,
    isDefault: false,
    archived: true,
    items: [],
  },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return <IntlWrapper>{children}</IntlWrapper>;
}

function renderList(selectedListId?: string) {
  return render(<LocalShoppingList selectedListId={selectedListId} />, {
    wrapper: Wrapper,
  });
}

function resetStore(currentListId = "warehouse") {
  localStorage.clear();
  useShoppingStore.setState({
    lists,
    defaultListId: "default",
    currentListId,
    routes: [],
    restorePoints: [],
    unitPreferences: { ...DEFAULT_UNIT_PREFS },
    customUnits: [],
    packageRounding: false,
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LocalShoppingList URL navigation", () => {
  it("renders a hydration-safe shell before reconciling persisted state", () => {
    const markup = renderToString(
      <Wrapper>
        <LocalShoppingList selectedListId="default" />
      </Wrapper>,
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain("Neighborhood market");
    expect(useShoppingStore.getState().currentListId).toBe("warehouse");
  });

  it("honors an initial deep link and persists the viewed list", async () => {
    resetStore("default");
    renderList("warehouse");

    expect(await screen.findByTestId("current-list")).toHaveTextContent(
      "warehouse",
    );
    await waitFor(() =>
      expect(useShoppingStore.getState().currentListId).toBe("warehouse"),
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "missing", "archived", "bad/id"])(
    "normalizes a missing, malformed, or stale id (%s) to the default",
    async (selectedListId) => {
      renderList(selectedListId);

      expect(await screen.findByTestId("current-list")).toHaveTextContent(
        "default",
      );
      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith("/shopping?list=default", {
          scroll: false,
        }),
      );
      expect(router.replace).toHaveBeenCalledTimes(1);
      expect(useShoppingStore.getState().currentListId).toBe("default");
      expect(useShoppingStore.getState().defaultListId).toBe("default");
    },
  );

  it("follows Back and Forward URL changes without adding history entries", async () => {
    const view = renderList("default");
    expect(await screen.findByTestId("current-list")).toHaveTextContent(
      "default",
    );

    view.rerender(<LocalShoppingList selectedListId="warehouse" />);
    await waitFor(() =>
      expect(screen.getByTestId("current-list")).toHaveTextContent("warehouse"),
    );
    expect(useShoppingStore.getState().currentListId).toBe("warehouse");

    view.rerender(<LocalShoppingList selectedListId="default" />);
    await waitFor(() =>
      expect(screen.getByTestId("current-list")).toHaveTextContent("default"),
    );
    expect(useShoppingStore.getState().currentListId).toBe("default");

    view.rerender(<LocalShoppingList selectedListId="warehouse" />);
    await waitFor(() =>
      expect(screen.getByTestId("current-list")).toHaveTextContent("warehouse"),
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("pushes explicit selections while retaining keyboard focus and the default", async () => {
    const user = userEvent.setup();
    renderList("default");
    const select = await screen.findByLabelText("Current list");
    select.focus();

    await user.selectOptions(select, "warehouse");

    expect(router.push).toHaveBeenCalledWith("/shopping?list=warehouse", {
      scroll: false,
    });
    expect(useShoppingStore.getState().currentListId).toBe("warehouse");
    expect(useShoppingStore.getState().defaultListId).toBe("default");
    expect(select).toHaveFocus();
  });

  it("pushes a newly created list without making it the default", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    renderList("default");

    await user.click(await screen.findByRole("button", { name: "New list" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("List name"), "Farmers");
    await user.click(
      within(dialog).getByRole("button", { name: "Create list" }),
    );

    expect(router.push).toHaveBeenCalledWith(
      "/shopping?list=00000000-0000-4000-8000-000000000001",
      { scroll: false },
    );
    expect(useShoppingStore.getState().currentListId).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(useShoppingStore.getState().defaultListId).toBe("default");
  });

  it.each([["Archive", "archive"] as const, ["Delete", "delete"] as const])(
    "replaces a %s URL with the deterministic fallback",
    async (actionLabel, state) => {
      const user = userEvent.setup();
      renderList("warehouse");
      await screen.findByTestId("current-list");

      await user.click(screen.getByRole("button", { name: "Manage" }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: actionLabel,
        }),
      );

      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith("/shopping?list=default", {
          scroll: false,
        }),
      );
      expect(router.replace).toHaveBeenCalledTimes(1);
      expect(useShoppingStore.getState().currentListId).toBe("default");
      expect(useShoppingStore.getState().defaultListId).toBe("default");
      const warehouse = useShoppingStore
        .getState()
        .lists.find((list) => list.id === "warehouse");
      if (state === "archive") {
        expect(warehouse).toMatchObject({ archived: true });
      } else {
        expect(warehouse).toBeUndefined();
      }
    },
  );
});
