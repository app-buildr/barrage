// Petits formats partagés par les surfaces. Fonctions pures, testées dans
// tests/format.test.ts.

/** Locale de tous les formats, tant que l'extension n'existe qu'en français. */
export const LOCALE = "fr-FR";

/**
 * « 1 425 ». Sans formateur gardé en mémoire : ce module est lu par le content
 * script, voir core/intl.ts pour les formats propres aux options.
 */
export const formatCount = (count: number): string => count.toLocaleString(LOCALE);

/**
 * Nombre abrégé comme sur X : « 845 », « 12,4 k », « 1,2 M ». Arrondi vers le
 * bas : 999 999 donne « 999,9 k », jamais « 1 000 k ».
 */
export function compactCount(count: number): string {
  const [unit, size] = count >= 1e6 ? ["M", 1e6] : count >= 1e3 ? ["k", 1e3] : ["", 1];
  if (!unit) return formatCount(count);
  const value = Math.floor((count / size) * 10) / 10;
  return `${value.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}\u00a0${unit}`;
}

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

/** « 574 comptes retirés, 12 ajoutés », « 3 comptes ajoutés ». */
export function diffSummary(removed: number, added: number): string {
  const parts: string[] = [];
  if (removed) parts.push(plural(removed, "compte retiré", "comptes retirés"));
  if (added) parts.push(removed ? plural(added, "ajouté") : plural(added, "compte ajouté", "comptes ajoutés"));
  return parts.join(", ");
}
