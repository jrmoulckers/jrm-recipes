"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "~/lib/error-copy";

import { addMemberAction } from "~/server/groups/actions";
import { type AddMemberInput } from "~/server/groups/validation";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

type InviteRole = AddMemberInput["role"];

export function AddMemberForm({ slug }: { slug: string }) {
  const router = useRouter();
  const identifierId = React.useId();
  const roleId = React.useId();
  const [identifier, setIdentifier] = React.useState("");
  const [role, setRole] = React.useState<InviteRole>("member");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>(
    {},
  );
  const [isPending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    startTransition(() => {
      void addMemberAction(slug, { identifier, role }).then((result) => {
        if (!result.ok) {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(friendlyError(result.error));
          return;
        }

        toast.success("They've been added to the group");
        setIdentifier("");
        setRole("member");
        router.refresh();
      });
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border bg-surface/40 p-4"
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_11rem_auto] md:items-end">
        <div className="grid gap-2">
          <Label htmlFor={identifierId}>Handle or email</Label>
          <Input
            id={identifierId}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="@aunt-mary or mary@example.com"
            aria-invalid={Boolean(fieldErrors.identifier)}
            aria-describedby={
              fieldErrors.identifier ? `${identifierId}-error` : undefined
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={roleId}>Role</Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as InviteRole)}
          >
            <SelectTrigger id={roleId}>
              <SelectValue placeholder="Member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="kid">Kid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={isPending}>
          <UserPlus />
          {isPending ? "Adding…" : "Add"}
        </Button>
      </div>
      {fieldErrors.identifier?.[0] ? (
        <p id={`${identifierId}-error`} className="mt-2 text-sm text-destructive">
          {fieldErrors.identifier[0]}
        </p>
      ) : null}
    </form>
  );
}
