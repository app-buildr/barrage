// Petits formats partagés par les surfaces. Fonctions pures, testées dans
// tests/format.test.ts.

/** « 1 compte », « 2 comptes ». `many` : pluriel irrégulier ou groupe de mots. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count > 1 ? many : one}`;
}

/** Part de `total` en pourcentage, plafonnée à 100, 0 pour un total nul. */
export function percent(part: number, total: number): number {
  return total > 0 ? Math.min(100, (part / total) * 100) : 0;
}
