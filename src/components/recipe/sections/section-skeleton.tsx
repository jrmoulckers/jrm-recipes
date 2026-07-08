import { ListRowSkeleton, Skeleton } from "~/components/ui/skeleton";

/**
 * Shared fallback for the streamed recipe tab sections (#176). Mirrors the
 * `max-w-3xl` column the real sections render into so streaming them in causes
 * minimal layout shift.
 */
export function TabSectionSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      {Array.from({ length: 3 }).map((_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </div>
  );
}
