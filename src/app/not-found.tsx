import { type Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChefHat, Compass, Search, Users } from 'lucide-react';

import { brand } from '~/config/brand';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { LogoMark } from '~/components/layout/logo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound');
  return { title: t('title') };
}

/**
 * Themed 404. Rendered for `notFound()` calls and any unmatched route. Kept as
 * a simple Server Component. It renders inside the root layout, so it inherits
 * the active theme without needing any client behaviour.
 */
export default async function NotFound() {
  const t = await getTranslations('notFound');
  const tNav = await getTranslations('nav');

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_50%_0%,hsl(var(--primary)/0.12),transparent),radial-gradient(45%_50%_at_50%_100%,hsl(var(--accent)/0.10),transparent)]"
      />

      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <LogoMark className="size-14" />

        <p className="font-display text-6xl font-bold tracking-tight text-primary">404</p>

        <div className="flex flex-col gap-2">
          <h1 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t('heading')}
          </h1>
          <p className="text-pretty text-muted-foreground">{t('body', { brand: brand.name })}</p>
        </div>

        {/* Recovery search: the fastest path back is usually to look the recipe
            up by name. Plain GET form so it works without client JS and keeps
            the themed, no-flash Server Component. */}
        <form action="/recipes" method="get" role="search" className="w-full">
          <Label htmlFor="not-found-search" className="sr-only">
            {t('searchLabel')}
          </Label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="not-found-search"
                type="search"
                name="q"
                placeholder={t('searchPlaceholder')}
                autoComplete="off"
                className="ps-10"
              />
            </div>
            <Button type="submit">{t('searchSubmit')}</Button>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/">
              <ChefHat /> {tNav('home')}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/recipes">
              <Compass /> {t('browseRecipes')}
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href="/groups">
              <Users /> {tNav('family')}
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
