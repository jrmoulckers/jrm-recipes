"use client";

import * as React from "react";

import { cn } from "~/lib/utils";
import { Label } from "./label";

/**
 * Shared, accessible form-field primitive (#161 follow-up).
 *
 * Before this, every dialog and form (`create-group-dialog`,
 * `create-collection-dialog`, `add-member-form`, the recipe editor's private
 * `Field`, …) re-hand-rolled the same wiring: a `<Label htmlFor>`, an
 * `aria-invalid` control, an `aria-describedby` link to a `<p class="text-sm
 * text-destructive">`, and a separate hint paragraph. Each copy drifted slightly,
 * and several skipped `aria-describedby`/`aria-required` entirely.
 *
 * `FormField` owns that contract once: it generates a stable id, associates the
 * label, threads `aria-invalid` / `aria-required` / `aria-describedby` onto the
 * single child control, and renders the hint (only while valid) and the error.
 * The error is a polite live region so assistive tech announces server-side
 * validation results that appear after submit — not just on focus.
 *
 * All copy is passed in by the caller (so it stays in the caller's next-intl
 * namespace); this primitive contributes no hardcoded strings. Styling is
 * token-only and layout uses logical spacing so it mirrors correctly under RTL.
 */

/** Normalize a Zod-style `string[]` or a single string to the first message. */
function firstMessage(
  error?: string | readonly string[] | null,
): string | undefined {
  if (error == null) return undefined;
  const message = typeof error === "string" ? error : error[0];
  return message && message.length > 0 ? message : undefined;
}

/** A standalone hint line, tied to a control via `id`. */
export function FieldHint({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p id={id} className={cn("text-xs text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/**
 * A standalone error line, tied to a control via `id`. Rendered as a polite live
 * region so it is announced when it appears after a submit.
 */
export function FieldError({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn("text-sm text-destructive", className)}
    >
      {children}
    </p>
  );
}

export interface FormFieldProps {
  /** The visible field label. */
  label: React.ReactNode;
  /** Optional helper text shown below the control while it is valid. */
  hint?: React.ReactNode;
  /** Validation message(s); the first non-empty entry is shown. */
  error?: string | readonly string[] | null;
  /** Marks the field required (renders `*` and sets `aria-required`). */
  required?: boolean;
  /** Optional explicit control id; otherwise one is generated. */
  htmlFor?: string;
  className?: string;
  /** A single form control (input, textarea, select, …). */
  children: React.ReactElement;
}

/**
 * Label + control + hint/error, with the accessibility wiring done for you.
 * Clones the single child control to thread the generated id and ARIA state.
 */
export function FormField({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  const reactId = React.useId();
  const child = React.isValidElement(children)
    ? (children as React.ReactElement<Record<string, unknown>>)
    : null;

  const existingId =
    child && typeof child.props.id === "string" ? child.props.id : undefined;
  const controlId = htmlFor ?? existingId ?? reactId;

  const message = firstMessage(error);
  const hasError = Boolean(message);
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = hasError ? errorId : hint ? hintId : undefined;

  const existingDescribedBy =
    child && typeof child.props["aria-describedby"] === "string"
      ? child.props["aria-describedby"]
      : undefined;

  const control = child
    ? React.cloneElement(child, {
        id: controlId,
        "aria-required": required ? true : undefined,
        "aria-invalid": hasError ? true : undefined,
        "aria-describedby":
          [existingDescribedBy, describedBy].filter(Boolean).join(" ") ||
          undefined,
      })
    : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={controlId} className="flex items-center gap-1">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {control}
      {hint && !hasError ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      {hasError ? <FieldError id={errorId}>{message}</FieldError> : null}
    </div>
  );
}
