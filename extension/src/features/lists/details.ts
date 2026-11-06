// Ligne de détails d'une liste dans Réglages. À part de lists.ts, lu aussi par
// le content script : le formateur de dates ne sert qu'à la page d'options.
import { plural } from "../../core/format.ts";
import type { ListDef } from "./lists.ts";

const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

/** « il y a 2 h », d'après l'écart en millisecondes. */
function elapsed(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `il y a ${hours} h` : `il y a ${Math.floor(hours / 24)} j`;
}

export function listDetails(list: ListDef, count: number, now: number): string {
  const size = plural(count, "compte");
  switch (list.source) {
    case "manual":
      return `${size} · ${count > 1 ? "ajoutés" : "ajouté"} à la main`;
    case "file":
      return `${size} · fichier importé le ${SHORT_DATE.format(list.addedAt)}`;
    default:
      return list.syncedAt ? `${size} · GitHub · mise à jour ${elapsed(now - list.syncedAt)}` : `${size} · GitHub`;
  }
}
