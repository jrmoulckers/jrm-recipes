"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { updateGroupAction } from "~/server/groups/actions";
import { type GroupInput } from "~/server/groups/validation";
import { Button } from "~/components/ui/button";
import { ImageUploadField } from "~/components/ui/image-upload";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

export function GroupSettingsForm({
  slug,
  group,
}: {
  slug: string;
  group: {
    name: string;
    description: string | null;
    avatarUrl: string | null;
  };
}) {
  const router = useRouter();
  const t = useTranslations("groups.settings");
  const nameId = React.useId();
  const descriptionId = React.useId();
  const [name, setName] = React.useState(group.name);
  const [description, setDescription] = React.useState(group.description ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(group.avatarUrl ?? "");
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});
  const [isPending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: GroupInput = { name, description, avatarUrl };
    setFieldErrors({});

    startTransition(() => {
      void updateGroupAction(slug, input).then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }

        toast.success(t("toast.saved"));
        router.refresh();
      });
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-token"
    >
      <div className="grid gap-2">
        <Label htmlFor={nameId}>{t("fields.name")}</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? `${nameId}-error` : undefined}
        />
        {fieldErrors.name?.[0] ? (
          <p id={`${nameId}-error`} className="text-sm text-destructive">
            {fieldErrors.name[0]}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={descriptionId}>{t("fields.description")}</Label>
        <Textarea
          id={descriptionId}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-invalid={Boolean(fieldErrors.description)}
          aria-describedby={
            fieldErrors.description ? `${descriptionId}-error` : undefined
          }
        />
        {fieldErrors.description?.[0] ? (
          <p id={`${descriptionId}-error`} className="text-sm text-destructive">
            {fieldErrors.description[0]}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        {/* Owner/admin only. The gate is server-side in `updateGroup`
            (`requireManager`); this form is simply not reachable for anyone
            else, and rendering the picker changes nothing about that. */}
        <ImageUploadField
          label={t("fields.avatarUrl")}
          value={avatarUrl}
          onChange={(url) => setAvatarUrl(url)}
          folder="heirloom/groups"
          size="compact"
        />
        {fieldErrors.avatarUrl?.[0] ? (
          <p className="text-sm text-destructive">{fieldErrors.avatarUrl[0]}</p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("actions.saving") : t("actions.save")}
        </Button>
      </div>
    </form>
  );
}
