// Compte rendu du formulaire d'ajout. Fonctions pures, testées dans
// tests/add-report.test.ts.
import { plural } from "../../core/format.ts";
import type { StatusKind } from "../../ui/layout/Section.tsx";
import type { AddResult } from "./store.ts";

/** « @a, @b et @c », tronqué au-delà de quelques noms. */
function names(handles: readonly string[], prefix = "@"): string {
  const shown = handles.slice(0, 5).map((h) => prefix + h);
  const more = handles.length - shown.length;
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} et ${shown.at(-1)}` : (shown[0] ?? "");
  return more > 0 ? `${shown.join(", ")} et ${plural(more, "autre")}` : list;
}

export type AddReport = { message: string; kind: StatusKind };

export function addReport({ added, existing, inactive }: AddResult, invalid: readonly string[]): AddReport {
  const parts: string[] = [];
  if (added.length) parts.push(`${plural(added.length, "compte ajouté", "comptes ajoutés")} : ${names(added)}.`);
  if (existing.length) parts.push(`Déjà dans la liste : ${names(existing)}.`);
  if (invalid.length) parts.push(`Comptes invalides : ${names(invalid, "")}.`);
  if (added.length && inactive) {
    parts.push("Ma liste perso est désactivée : activez-la dans Réglages pour bloquer ces comptes.");
  }
  return {
    message: parts.join(" "),
    kind: invalid.length && !added.length ? "error" : added.length ? "ok" : "warn",
  };
}
