// Filtrage de la liste par texte et par catégorie, sans toucher aux données.
// Fonctions pures, testées dans tests/filter.test.ts.
import { ACCOUNT_PAGE } from "../../core/config.ts";
import { formatCount, plural } from "../../core/format.ts";
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

/** Libellé du bouton qui montre les lignes suivantes, ou null s'il n'en reste pas. */
export function moreLabel(total: number, limit: number): string | null {
  const next = Math.min(ACCOUNT_PAGE, total - limit);
  if (next <= 0) return null;
  return next === 1 ? "Afficher le compte suivant" : `Afficher les ${formatCount(next)} comptes suivants`;
}

/** Ce qui est affiché, quand tout ne l'est pas. */
export const shownCount = (total: number, limit: number): string =>
  `${plural(limit, "compte affiché", "comptes affichés")} sur ${formatCount(total)}`;
