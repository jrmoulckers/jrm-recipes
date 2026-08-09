import { type Metadata } from "next";
import { ShoppingCart } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  getShoppingListHistory,
  getShoppingWorkspace,
} from "~/server/shopping/queries";
import { listMemberProfiles } from "~/server/dietary/queries";
import { detectAllergensForSafety, isAllergen } from "~/lib/allergens";
import { type ActiveMemberOption } from "~/lib/dietary-match";
import { type ShoppingCategory } from "~/lib/shopping-list";
import { findIngredientRoute } from "~/lib/shopping-routing";
import { DbShoppingList } from "~/components/shopping/db-shopping-list";
import { LocalShoppingList } from "~/components/shopping/local-shopping-list";
import { type ShoppingViewItem } from "~/components/shopping/shopping-list-view";
import { type ShoppingListSummary } from "~/components/shopping/shopping-list-navigation";
import { type ShoppingHistoryEntry } from "~/components/shopping/shopping-history";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return { title: t("shopping.title") };
}

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string | string[] }>;
}) {
  const dbEnabled = isDbConfigured();
  const user = dbEnabled ? await getCurrentUser() : null;
  const t = await getTranslations("shopping.page");
  const query = await searchParams;
  const selectedListId = Array.isArray(query.list) ? query.list[0] : query.list;
  const [workspace, profiles] = await Promise.all([
    getShoppingWorkspace(user, selectedListId),
    user ? listMemberProfiles(user.id) : Promise.resolve([]),
  ]);
  const history =
    user && workspace?.selectedListId
      ? ((await getShoppingListHistory(user, workspace.selectedListId)) ?? [])
      : [];

  const items: ShoppingViewItem[] = (workspace?.selectedList?.items ?? []).map(
    (row) => {
      const route = findIngredientRoute(row, workspace?.routes ?? []);
      return {
        id: row.id,
        item: row.item,
        quantity: row.quantity,
        quantityMax: row.quantityMax,
        unit: row.unit,
        note: row.note,
        category: (row.category as ShoppingCategory | null) ?? "Other",
        optional: row.optional,
        checked: row.checked,
        allergens: detectAllergensForSafety(row.item),
        routePreferredListId: route?.preferredListId ?? null,
        routeAlternativeListIds:
          route?.alternativeListIds.filter((id) =>
            workspace?.lists.some(
              (list) => list.id === id && list.archivedAt == null,
            ),
          ) ?? [],
      };
    },
  );
  const lists: ShoppingListSummary[] = (workspace?.lists ?? []).map((list) => ({
    id: list.id,
    name: list.name,
    storeName: list.storeName,
    isDefault: list.isDefault,
    archived: list.archivedAt != null,
    itemCount: list.items.length,
  }));
  const historyEntries: ShoppingHistoryEntry[] = history.map((point) => ({
    id: point.id,
    operation: point.operation,
    createdAt: point.createdAt,
    restorePoints: point.restorePoints,
    items: point.items.map((item) => ({
      id: item.id,
      item: item.item,
      quantity: item.quantity,
      quantityMax: item.quantityMax,
      unit: item.unit,
      note: item.note,
      category: (item.category as ShoppingCategory | null) ?? "Other",
      optional: item.optional,
      checked: item.checked,
    })),
  }));

  const members: ActiveMemberOption[] = profiles.map((m) => ({
    id: m.id,
    name: m.name,
    allergens: (m.allergens ?? []).filter(isAllergen),
  }));

  return (
    <div className="container flex max-w-3xl flex-col gap-8 py-10">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-primary/12 inline-flex size-9 items-center justify-center rounded-xl text-primary">
            <ShoppingCart className="size-5" />
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
        </div>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>

      {dbEnabled ? (
        <DbShoppingList
          items={items}
          lists={lists}
          selectedListId={workspace?.selectedListId ?? ""}
          defaultListId={workspace?.defaultListId ?? ""}
          historyEntries={historyEntries}
          members={members}
        />
      ) : (
        <LocalShoppingList />
      )}
    </div>
  );
}
