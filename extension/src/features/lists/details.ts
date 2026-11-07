// Ligne de détails d'une liste dans Réglages. À part de lists.ts, lu aussi par
// le content script : les formats de dates ne servent qu'à la page d'options.
import { OFFICIAL_LIST_URL } from "../../core/config.ts";
import { plural, pluralWord } from "../../core/format.ts";
import { formatAgo, formatShortDate } from "../../core/intl.ts";
import type { ListDef } from "./lists.ts";

/** Segment de la ligne de détails, séparé du suivant par « · » ; `href` : lien vers la liste en ligne. */
export type DetailSegment = { text: string; href?: string };

export function listDetailSegments(list: ListDef, count: number, now: number): DetailSegment[] {
  const size = { text: plural(count, "compte") };
  switch (list.source) {
    case "manual":
      return [size, { text: `${pluralWord(count, "ajouté")} à la main` }];
    case "file":
      return [size, { text: `fichier importé le ${formatShortDate(list.addedAt)}` }];
    case "official":
    case "github": {
      const href = listPageUrl(list);
      const github = href ? { text: "GitHub", href } : { text: "GitHub" };
      return list.syncedAt ? [size, github, { text: `mise à jour ${formatAgo(now - list.syncedAt)}` }] : [size, github];
    }
  }
}

/**
 * Page web où consulter la liste : celle du fichier GitHub ou du Gist dont
 * l'adresse brute est téléchargée. null sans adresse reconnue.
 */
export function listPageUrl(list: ListDef): string | null {
  if (list.source === "official") return rawToPage(OFFICIAL_LIST_URL);
  return list.source === "github" ? rawToPage(list.url) : null;
}

function rawToPage(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname === "raw.githubusercontent.com" && parts.length >= 4) {
    const [owner, repo, ...rest] = parts;
    const path = rest[0] === "refs" && rest[1] === "heads" ? rest.slice(2) : rest;
    return `https://github.com/${owner}/${repo}/blob/${path.join("/")}`;
  }
  if (url.hostname === "gist.githubusercontent.com" && parts.length >= 2) {
    return `https://gist.github.com/${parts[0]}/${parts[1]}`;
  }
  return null;
}
