export function normalizeFoodText(item: string | null | undefined): string {
  if (!item) return '';
  let value = item.toLowerCase();
  value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  value = value.replace(/\([^)]*\)/g, ' ');
  value = value.split(',')[0] ?? value;
  value = value.replace(/[^a-z0-9]+/g, ' ');
  return value.replace(/\s+/g, ' ').trim();
}
