/**
 * Append a full stop unless the value already ends a sentence.
 *
 * Trainee display names in this product are frequently `"Yusuf A."` — an initial with
 * its own stop — so any sentence that interpolates one and then punctuates produces a
 * double stop. It is the smallest possible defect and it was shipped and then pinned by
 * a test, which is why it gets a named helper rather than a `.replace` at one call site.
 *
 * EV-342m: its own module, imported by BOTH dictionaries, so that neither dictionary's
 * browser chunk imports the other (`src/lib/i18n/client.tsx` loads only the coach's).
 */
export function endSentence(value: string): string {
  return /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`;
}
