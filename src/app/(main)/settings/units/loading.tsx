import { Skeleton } from '~/components/ui/skeleton';

export default function UnitsSettingsLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10">
      <header className="flex max-w-2xl flex-col gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full" />
      </header>

      <div className="flex flex-col gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
