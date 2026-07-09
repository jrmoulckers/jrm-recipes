"use client";

import { Printer } from "lucide-react";

import { Button } from "~/components/ui/button";

/**
 * Generic "print this page" trigger (issues #397/#407). Kept as a tiny client
 * island so the surrounding print layouts stay server components; hide it on
 * paper with `print:hidden` at the call site.
 */
export function PrintNowButton({
  label = "Print",
  variant = "default",
}: {
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
}) {
  return (
    <Button type="button" variant={variant} onClick={() => window.print()}>
      <Printer aria-hidden="true" /> {label}
    </Button>
  );
}
