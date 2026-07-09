"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import {
  createMemberProfileAction,
  deleteMemberProfileAction,
  updateMemberProfileAction,
} from "~/server/dietary/actions";
import { type MemberProfileInputRaw } from "~/server/dietary/validation";
import { ALLERGENS, ALLERGEN_LABELS, type Allergen } from "~/lib/allergens";
import {
  DIETARY_TAGS,
  DIETARY_TAG_LABELS,
  type DietaryTag,
} from "~/lib/substitutions";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export type MemberProfileView = {
  id: string;
  name: string;
  allergens: Allergen[];
  diets: DietaryTag[];
  calorieGoal: number | null;
  groupId: string | null;
};

type GroupOption = { id: string; name: string };

/** Which form the dialog is showing: adding a new member or editing one. */
type EditingState = { kind: "add" } | { kind: "edit"; id: string };

type Draft = {
  name: string;
  allergens: Allergen[];
  diets: DietaryTag[];
  calorieGoal: string;
  groupId: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  allergens: [],
  diets: [],
  calorieGoal: "",
  groupId: "",
};

function toDraft(profile: MemberProfileView): Draft {
  return {
    name: profile.name,
    allergens: profile.allergens,
    diets: profile.diets,
    calorieGoal: profile.calorieGoal != null ? String(profile.calorieGoal) : "",
    groupId: profile.groupId ?? "",
  };
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function DietaryProfilesManager({
  profiles,
  groups,
}: {
  profiles: MemberProfileView[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const nameId = React.useId();
  const calorieId = React.useId();
  const groupSelectId = React.useId();

  // `null` = dialog closed.
  const [editing, setEditing] = React.useState<EditingState | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});
  const [isPending, startTransition] = React.useTransition();

  const groupName = React.useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups],
  );

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
    setEditing({ kind: "add" });
  }

  function openEdit(profile: MemberProfileView) {
    setDraft(toDraft(profile));
    setFieldErrors({});
    setEditing({ kind: "edit", id: profile.id });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const input: MemberProfileInputRaw = {
      name: draft.name,
      allergens: draft.allergens,
      diets: draft.diets,
      calorieGoal: draft.calorieGoal.trim() || undefined,
      groupId: draft.groupId || undefined,
    };
    setFieldErrors({});

    const isAdd = editing.kind === "add";
    startTransition(() => {
      const run = isAdd
        ? createMemberProfileAction(input)
        : updateMemberProfileAction(editing.id, input);
      void run.then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success(isAdd ? "Profile added" : "Profile updated");
        setEditing(null);
        router.refresh();
      });
    });
  }

  function onDelete(profile: MemberProfileView) {
    const ok = window.confirm(
      `Remove ${profile.name}'s dietary profile? This can't be undone.`,
    );
    if (!ok) return;
    startTransition(() => {
      void deleteMemberProfileAction(profile.id).then((result) => {
        if (!result.ok) {
          toast.error(friendlyError(result.error));
          return;
        }
        toast.success("Profile removed");
        router.refresh();
      });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button onClick={openAdd}>
          <Plus /> Add family member
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <UtensilsCrossed className="size-7" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">
              No profiles yet
            </h2>
            <p className="mt-1 max-w-md text-muted-foreground">
              Record who you cook for — their allergies, diets, and calorie
              goals — so Heirloom can help you cook safely for everyone.
            </p>
          </div>
          <Button onClick={openAdd}>
            <Plus /> Add family member
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-token"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold">
                    {profile.name}
                  </h3>
                  {profile.groupId && groupName.has(profile.groupId) ? (
                    <p className="text-xs text-muted-foreground">
                      {groupName.get(profile.groupId)}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${profile.name}`}
                    onClick={() => openEdit(profile)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${profile.name}`}
                    onClick={() => onDelete(profile)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {profile.allergens.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.allergens.map((a) => (
                    <Badge key={a} variant="warning">
                      {ALLERGEN_LABELS[a]}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {profile.diets.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.diets.map((d) => (
                    <Badge key={d} variant="secondary">
                      {DIETARY_TAG_LABELS[d]}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {profile.calorieGoal != null ? (
                <p className="text-sm text-muted-foreground">
                  {profile.calorieGoal.toLocaleString()} kcal/day goal
                </p>
              ) : null}

              {profile.allergens.length === 0 &&
              profile.diets.length === 0 &&
              profile.calorieGoal == null ? (
                <p className="text-sm text-muted-foreground">
                  No restrictions recorded.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={onSubmit} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>
                {editing?.kind === "add" ? "Add family member" : "Edit profile"}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
                placeholder="e.g. Theo"
                aria-invalid={Boolean(fieldErrors.name)}
                autoFocus
              />
              {fieldErrors.name?.[0] ? (
                <p className="text-sm text-destructive">{fieldErrors.name[0]}</p>
              ) : null}
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-foreground">
                Allergies
              </legend>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((a) => {
                  const checked = draft.allergens.includes(a);
                  return (
                    <label
                      key={a}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        checked
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={checked}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            allergens: toggle(d.allergens, a),
                          }))
                        }
                      />
                      {ALLERGEN_LABELS[a]}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium text-foreground">
                Diets
              </legend>
              <div className="flex flex-wrap gap-2">
                {DIETARY_TAGS.map((tag) => {
                  const checked = draft.diets.includes(tag);
                  return (
                    <label
                      key={tag}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        checked
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={checked}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            diets: toggle(d.diets, tag),
                          }))
                        }
                      />
                      {DIETARY_TAG_LABELS[tag]}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-2">
              <Label htmlFor={calorieId}>Daily calorie goal</Label>
              <Input
                id={calorieId}
                value={draft.calorieGoal}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, calorieGoal: e.target.value }))
                }
                inputMode="numeric"
                placeholder="Optional — e.g. 2000"
                aria-invalid={Boolean(fieldErrors.calorieGoal)}
              />
              {fieldErrors.calorieGoal?.[0] ? (
                <p className="text-sm text-destructive">
                  {fieldErrors.calorieGoal[0]}
                </p>
              ) : null}
            </div>

            {groups.length > 0 ? (
              <div className="grid gap-2">
                <Label htmlFor={groupSelectId}>Family group (optional)</Label>
                <select
                  id={groupSelectId}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  value={draft.groupId}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, groupId: e.target.value }))
                  }
                >
                  <option value="">Just me</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.groupId?.[0] ? (
                  <p className="text-sm text-destructive">
                    {fieldErrors.groupId[0]}
                  </p>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? "Saving…"
                  : editing?.kind === "add"
                    ? "Add member"
                    : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
