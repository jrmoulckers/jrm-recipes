import { type Metadata } from "next";
import { ShoppingCart } from "lucide-react";

import { getCurrentUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { getShoppingList } from "~/server/shopping/queries";
import { listMemberProfiles } from "~/server/dietary/queries";
import { detectAllergensForSafety, isAllergen } from "~/lib/allergens";
import { type ActiveMemberOption } from "~/lib/dietary-match";
import { type ShoppingCategory } from "~/lib/shopping-list";
import { DbShoppingList } from "~/components/shopping/db-shopping-list";
import { LocalShoppingList } from "~/components/shopping/local-shopping-list";
import { type ShoppingViewItem } from "~/components/shopping/shopping-list-view";

export const metadata: Metadata = { title: "Shopping list" };

export default async function ShoppingPage() {
  const dbEnabled = isDbConfigured();
  const user = dbEnabled ? await getCurrentUser() : null;
  const [list, profiles] = await Promise.all([
    getShoppingList(user),
    user ? listMemberProfiles(user.id) : Promise.resolve([]),
  ]);

  const items: ShoppingViewItem[] = (list?.items ?? []).map((row) => ({
    id: row.id,
    item: row.item,
    quantity: row.quantity,
    quantityMax: row.quantityMax,
    unit: row.unit,
    note: row.note,
    category: (row.category as ShoppingCategory | null) ?? "Other",
    checked: row.checked,
    allergens: detectAllergensForSafety(row.item),
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
          <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <ShoppingCart className="size-5" />
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Shopping list
          </h1>
        </div>
        <p className="text-muted-foreground">
          Everything you need, combined and tallied across your recipes. Check
          items off as you shop.
        </p>
      </header>

      {dbEnabled ? (
        <DbShoppingList items={items} members={members} />
      ) : (
        <LocalShoppingList />
      )}
    </div>
  );
}
