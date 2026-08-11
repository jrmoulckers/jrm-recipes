'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { CloseButton } from '~/components/ui/close-button';
import { pathnameWithQuery } from '~/lib/routes';
import { MAX_PANTRY_ITEMS } from '~/server/recipes/search';

/**
 * Chips input for "cook with what you have". Pantry items live in the URL
 * (`?have=chicken,rice`) so results are shareable and SSR-rendered. Typing
 * commits on Enter/comma/blur and each chip can be removed.
 */
export function CookWithInput({ initial }: { initial: string[] }) {
  const t = useTranslations('recipe');
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = React.useState<string[]>(initial);
  const [draft, setDraft] = React.useState('');
  const [, startTransition] = React.useTransition();

  // Reflect URL-driven changes (back/forward, shared link) into local chips.
  React.useEffect(() => setItems(initial), [initial]);

  const commit = React.useCallback(
    (next: string[]) => {
      setItems(next);
      const params = new URLSearchParams();
      if (next.length > 0) params.set('have', next.join(','));
      const qs = params.toString();
      startTransition(() => router.replace(pathnameWithQuery(pathname, qs), { scroll: false }));
    },
    [pathname, router],
  );

  const addFrom = (raw: string) => {
    const additions = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set(items.map((i) => i.toLowerCase()));
    const next = [...items];
    for (const addition of additions) {
      if (addition.length > 60) continue;
      const key = addition.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(addition);
      if (next.length >= MAX_PANTRY_ITEMS) break;
    }
    setDraft('');
    if (next.length !== items.length) commit(next);
  };

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addFrom(draft);
    } else if (event.key === 'Backspace' && draft === '' && items.length > 0) {
      commit(items.slice(0, -1));
    }
  }

  const remove = (item: string) => commit(items.filter((i) => i !== item));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        <Search className="ms-1 size-4 shrink-0 text-muted-foreground" />
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-sm text-accent-foreground"
          >
            {item}
            <CloseButton
              size="sm"
              onClick={() => remove(item)}
              label={t('cookWithInput.removeItem', { item })}
              className="-me-1 text-accent-foreground/70 hover:bg-accent-foreground/10 hover:text-accent-foreground"
            />
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addFrom(draft)}
          placeholder={
            items.length === 0 ? t('cookWithInput.addIngredients') : t('cookWithInput.addMore')
          }
          className="min-w-[10rem] flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
          aria-label={t('cookWithInput.addIngredientAria')}
        />
        {items.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => commit([])}>
            {t('common.clear')}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t('cookWithInput.help')}</p>
    </div>
  );
}
