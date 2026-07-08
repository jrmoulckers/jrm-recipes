"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { updateGroupAction } from "~/server/groups/actions";
import { type GroupInput } from "~/server/groups/validation";
import { Button } from "~/components/ui/button";
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
  const nameId = React.useId();
  const descriptionId = React.useId();
  const avatarId = React.useId();
  const [name, setName] = React.useState(group.name);
  const [description, setDescription] = React.useState(group.description ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(group.avatarUrl ?? "");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>(
    {},
  );
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

        toast.success("Group settings saved");
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
        <Label htmlFor={nameId}>Group name</Label>
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
        <Label htmlFor={descriptionId}>Description</Label>
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
        <Label htmlFor={avatarId}>Avatar image URL</Label>
        <Input
          id={avatarId}
          value={avatarUrl}
          onChange={(event) => setAvatarUrl(event.target.value)}
          placeholder="https://…"
          aria-invalid={Boolean(fieldErrors.avatarUrl)}
          aria-describedby={
            fieldErrors.avatarUrl ? `${avatarId}-error` : undefined
          }
        />
        {fieldErrors.avatarUrl?.[0] ? (
          <p id={`${avatarId}-error`} className="text-sm text-destructive">
            {fieldErrors.avatarUrl[0]}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
