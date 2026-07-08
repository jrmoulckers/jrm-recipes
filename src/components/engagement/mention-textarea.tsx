"use client";

import * as React from "react";

import { cn } from "~/lib/utils";
import {
  activeMentionQuery,
  normalizeHandle,
  type MentionCandidate,
} from "~/lib/mentions";
import { Textarea } from "~/components/ui/textarea";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar";

type Props = Omit<
  React.ComponentPropsWithoutRef<typeof Textarea>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  candidates: MentionCandidate[];
};

function matches(candidate: MentionCandidate, query: string): boolean {
  const q = query.toLowerCase();
  if (q.length === 0) return true;
  const handle = candidate.handle ? normalizeHandle(candidate.handle) : "";
  const name = (candidate.name ?? "").toLowerCase();
  return handle.startsWith(q) || name.includes(q);
}

/**
 * Textarea with @mention autocomplete (issue #340). Detects an in-progress
 * `@handle` token at the caret and offers matching members (recipe group +
 * author); selecting one inserts `@handle `. Purely additive over the shared
 * Textarea so comments and reviews can both use it.
 */
export function MentionTextarea({
  value,
  onChange,
  candidates,
  className,
  onKeyDown,
  ...props
}: Props) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const suggestions = React.useMemo(() => {
    if (!open) return [];
    return candidates
      .filter((c) => c.handle && matches(c, query))
      .slice(0, 6);
  }, [open, candidates, query]);

  const refreshFromCaret = React.useCallback(
    (el: HTMLTextAreaElement) => {
      const caret = el.selectionStart ?? el.value.length;
      const q = activeMentionQuery(el.value.slice(0, caret));
      if (q === null) {
        setOpen(false);
        return;
      }
      setQuery(q);
      setActive(0);
      setOpen(true);
    },
    [],
  );

  const insertMention = (candidate: MentionCandidate) => {
    const el = ref.current;
    if (!el || !candidate.handle) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const replaced = before.replace(/(^|\s)@[a-zA-Z0-9_.-]*$/, `$1@${candidate.handle} `);
    const next = replaced + after;
    onChange(next);
    setOpen(false);
    // Restore focus + place caret right after the inserted mention.
    requestAnimationFrame(() => {
      el.focus();
      const pos = replaced.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(suggestions[active]!);
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(event);
  };

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        className={className}
        onChange={(event) => {
          onChange(event.target.value);
          refreshFromCaret(event.target);
        }}
        onKeyUp={(event) => refreshFromCaret(event.currentTarget)}
        onClick={(event) => refreshFromCaret(event.currentTarget)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
      />
      {open && suggestions.length > 0 ? (
        <ul
          className="absolute z-50 mt-1 max-h-60 w-64 overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-token-lg"
          role="listbox"
        >
          {suggestions.map((candidate, i) => (
            <li key={candidate.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm",
                  i === active ? "bg-muted" : "hover:bg-muted/60",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(candidate);
                }}
              >
                <Avatar className="size-6">
                  {candidate.avatarUrl ? (
                    <AvatarImage
                      src={candidate.avatarUrl}
                      alt={candidate.name ?? candidate.handle ?? ""}
                    />
                  ) : null}
                  <AvatarFallback>
                    {(candidate.name ?? candidate.handle ?? "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">
                    {candidate.name ?? candidate.handle}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    @{candidate.handle}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
