import { type Metadata } from "next";
import { Users } from "lucide-react";

export const metadata: Metadata = { title: "Family" };

export default function GroupsPage() {
  return (
    <div className="container py-16">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Users className="size-7" />
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Family &amp; groups
        </h1>
        <p className="text-muted-foreground">
          Create a family space, invite the people you cook with, and build a
          shared cookbook together. Group features are on the way.
        </p>
      </div>
    </div>
  );
}
