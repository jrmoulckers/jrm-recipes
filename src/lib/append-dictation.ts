/**
 * Append dictated text to an existing value without wiping what's there
 * (issue #373).
 *
 * Kept in its own dependency-free module so the recipe editor can use it
 * without statically pulling the `useSpeechInput` hook (and the browser
 * SpeechRecognition wrapper) into its first-load bundle — the hook ships in a
 * lazily loaded chunk via the `DictationButton`.
 */
export function appendDictation(existing: string, added: string): string {
  const trimmedAdd = added.trim();
  if (!trimmedAdd) return existing;
  if (!existing.trim()) return trimmedAdd;
  const needsSpace = !/\s$/.test(existing);
  return `${existing}${needsSpace ? " " : ""}${trimmedAdd}`;
}
