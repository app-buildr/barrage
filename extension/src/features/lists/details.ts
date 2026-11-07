// Ligne de détails d'une liste dans Réglages. À part de lists.ts, lu aussi par
// le content script : les formats de dates ne servent qu'à la page d'options.
import { plural, pluralWord } from "../../core/format.ts";
import { formatAgo, formatShortDate } from "../../core/intl.ts";
import type { ListDef } from "./lists.ts";

export function listDetails(list: ListDef, count: number, now: number): string {
  const size = plural(count, "compte");
  switch (list.source) {
    case "manual":
      return `${size} · ${pluralWord(count, "ajouté")} à la main`;
    case "file":
      return `${size} · fichier importé le ${formatShortDate(list.addedAt)}`;
    case "official":
    case "github":
      return list.syncedAt ? `${size} · GitHub · mise à jour ${formatAgo(now - list.syncedAt)}` : `${size} · GitHub`;
  }
}
