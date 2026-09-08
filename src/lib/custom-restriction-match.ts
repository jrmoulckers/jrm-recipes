import { normalizeFoodText } from './food-text';

export function matchesCustomRestriction(value: string, terms: readonly string[]): boolean {
  const normalizedValue = ` ${normalizeFoodText(value)} `;
  return terms.some((term) => {
    const normalizedTerm = normalizeFoodText(term);
    return normalizedTerm.length > 0 && normalizedValue.includes(` ${normalizedTerm} `);
  });
}
