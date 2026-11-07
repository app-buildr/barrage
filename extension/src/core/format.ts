// Petits formats partagés par les surfaces. Fonctions pures, testées dans
// tests/format.test.ts.

/** Locale de tous les formats, tant que l'extension n'existe qu'en français. */
export const LOCALE = "fr-FR";

/**
 * « 1 425 ». Sans formateur gardé en mémoire : ce module est lu par le content
 * script, voir core/intl.ts pour les formats propres aux options.
 */
export const formatCount = (count: number): string => count.toLocaleString(LOCALE);

/** Le mot seul, accordé : « bloqué », « bloqués ». `many` : pluriel irrégulier ou groupe de mots. */
export function pluralWord(count: number, one: string, many = `${one}s`): string {
  return count > 1 ? many : one;
}

/** « 1 compte », « 2 comptes ». */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${pluralWord(count, one, many)}`;
}

/** Part de `total` en pourcentage, plafonnée à 100, 0 pour un total nul. */
export function percent(part: number, total: number): number {
  return total > 0 ? Math.min(100, (part / total) * 100) : 0;
}
