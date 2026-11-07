// Compte rendu du formulaire d'ajout. Fonctions pures, testées dans
// tests/add-report.test.ts.
import { plural, pluralWord } from "../../core/format.ts";
import { formatList } from "../../core/intl.ts";
import type { StatusReport } from "../../ui/layout/Section.tsx";
import type { AddResult } from "../lists/store.ts";

/** « @a, @b et @c », tronqué au-delà de quelques noms. */
function names(handles: readonly string[], prefix = "@"): string {
  const shown = handles.slice(0, 5).map((h) => prefix + h);
  const more = handles.length - shown.length;
  return formatList(more > 0 ? [...shown, plural(more, "autre")] : shown, "and");
}

export function addReport({ added, existing, inactiveList }: AddResult, invalid: readonly string[]): StatusReport {
  const parts: string[] = [];
  if (added.length) parts.push(`${plural(added.length, "compte ajouté", "comptes ajoutés")} : ${names(added)}.`);
  if (existing.length) parts.push(`Déjà dans la liste : ${names(existing)}.`);
  if (invalid.length) parts.push(`${pluralWord(invalid.length, "Compte invalide", "Comptes invalides")} : ${names(invalid, "")}.`);
  if (added.length && inactiveList !== null) {
    parts.push(`${inactiveList} est désactivée : activez-la dans Réglages pour bloquer ces comptes.`);
  }
  return {
    message: parts.join(" "),
    kind: invalid.length && !added.length ? "error" : added.length ? "ok" : "warn",
  };
}
