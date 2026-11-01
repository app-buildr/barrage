// Filtrage de la liste par texte et par catégorie, sans toucher aux données.
// Fonctions pures, testées dans tests/filter.test.ts.
import type { Category } from "./status.ts";

/** « @Nom » et « nom » cherchent la même chose. */
export function normalizeQuery(text: string): string {
  return text.trim().replace(/^@/, "").toLowerCase();
}

/** `query` déjà normalisée ; catégorie null : toutes. */
export function matches(
  line: { handle: string; category?: Category },
  query: string,
  category: Category | null,
): boolean {
  return (!query || line.handle.includes(query)) && (!category || line.category === category);
}

/** Message d'une liste filtrée vide. */
export function noMatchMessage(query: string): string {
  return query ? `Aucun compte ne correspond à « ${query} ».` : "Aucun compte dans cette catégorie.";
}
