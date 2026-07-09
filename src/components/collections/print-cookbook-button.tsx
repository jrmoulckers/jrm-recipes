"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { KEEPSAKE_NOTE_MAX } from "~/lib/keepsake";

/**
 * Opens the printable booklet for a collection (issue #397), optionally with a
 * dedication for the cover. The dedication rides in the print URL (no server
 * round-trip); the print page turns "Print → Save as PDF" into a real family
 * cookbook.
 */
export function PrintCookbookButton({
  collectionId,
}: {
  collectionId: string;
}) {
  const router = useRouter();
  const [dedication, setDedication] = React.useState("");

  function openPrint() {
    const trimmed = dedication.trim();
    const query = trimmed
      ? `?${new URLSearchParams({ dedication: trimmed }).toString()}`
      : "";
    router.push(`/collections/${collectionId}/print${query}`);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Printer /> Print cookbook
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print this cookbook</DialogTitle>
          <DialogDescription>
            Lay the whole collection out as one booklet — cover, contents, and
            every recipe — ready for “Print → Save as PDF.”
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cookbook-dedication">Dedication (optional)</Label>
          <Textarea
            id="cookbook-dedication"
            value={dedication}
            onChange={(event) => setDedication(event.target.value)}
            placeholder="For my grandchildren — so our kitchen is always with you."
            rows={3}
            maxLength={KEEPSAKE_NOTE_MAX}
          />
        </div>

        <DialogFooter>
          <Button type="button" onClick={openPrint}>
            <Printer /> Open print view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
