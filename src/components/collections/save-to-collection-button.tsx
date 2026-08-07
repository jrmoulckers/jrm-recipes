"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import {
  addRecipeToCollectionAction,
  createCollectionAction,
  removeRecipeFromCollectionAction,
} from "~/server/collections/actions";
import { type CollectionMembership } from "~/server/collections/queries";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";

export function SaveToCollectionButton({
  recipeId,
  collections,
  canSave,
}: {
  recipeId: string;
  collections: CollectionMembership[];
  canSave: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("saveToCollection");
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<CollectionMembership[]>(collections);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    setItems(collections);
  }, [collections]);

  function onOpenChange(next: boolean) {
    if (!canSave) {
      toast(t("signInToSave"));
      return;
    }
    setOpen(next);
  }

  function toggleMembership(collectionId: string, contains: boolean) {
    if (pendingId) return;
    setPendingId(collectionId);
    setItems((prev) =>
      prev.map((c) =>
        c.id === collectionId ? { ...c, contains: !contains } : c,
      ),
    );

    void (async () => {
      const result = contains
        ? await removeRecipeFromCollectionAction({ collectionId, recipeId })
        : await addRecipeToCollectionAction({ collectionId, recipeId });

      if (result.ok) {
        router.refresh();
      } else {
        setItems((prev) =>
          prev.map((c) => (c.id === collectionId ? { ...c, contains } : c)),
        );
        toast.error(friendlyError(result.error));
      }
      setPendingId(null);
    })();
  }

  function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (name.length === 0 || creating) return;
    setCreating(true);

    void (async () => {
      const created = await createCollectionAction({ name });
      if (!created.ok) {
        toast.error(friendlyError(created.error));
        setCreating(false);
        return;
      }
      const added = await addRecipeToCollectionAction({
        collectionId: created.id,
        recipeId,
      });
      if (!added.ok) {
        toast.error(friendlyError(added.error));
        setCreating(false);
        return;
      }
      setItems((prev) => [{ id: created.id, name, contains: true }, ...prev]);
      setNewName("");
      setCreating(false);
      toast.success(t("toast.savedTo", { name }));
      router.refresh();
    })();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <BookmarkPlus /> {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {items.length > 0 && (
          <ul
            aria-label={t("list")}
            className="grid max-h-64 gap-1 overflow-y-auto"
          >
            {items.map((collection) => (
              <li key={collection.id}>
                <button
                  type="button"
                  onClick={() =>
                    toggleMembership(collection.id, collection.contains)
                  }
                  disabled={pendingId === collection.id}
                  aria-pressed={collection.contains}
                  aria-label={t(collection.contains ? "remove" : "add", {
                    name: collection.name,
                  })}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <span className="line-clamp-1 font-medium">
                    {collection.name}
                  </span>
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      collection.contains
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-transparent",
                    )}
                  >
                    {pendingId === collection.id ? (
                      <Loader2 className="size-3.5 animate-spin text-foreground" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onCreate} className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t("newNameField")}
            maxLength={120}
            disabled={creating}
            aria-label={t("newNameField")}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={creating || newName.trim().length === 0}
          >
            {creating ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("create")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
