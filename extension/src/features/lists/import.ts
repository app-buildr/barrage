// Import d'une liste : validation de l'adresse et analyse du contenu, traité
// comme du texte. Fonctions pures, testées dans tests/multi-lists.test.ts.
import {
  IMPORT_MAX_INVALID_SHARE,
  LIST_FILE_EXTENSIONS,
  LIST_HOSTS,
  LIST_MAX_BYTES,
  LIST_MAX_SIZE,
} from "../../core/config.ts";
import { formatCount, plural } from "../../core/format.ts";
import { formatList } from "../../core/intl.ts";
import { parseEntries, splitEntries } from "./handles.ts";

/** Hôtes acceptés, tels qu'ils s'affichent dans les textes. */
export const LIST_HOSTS_TEXT = formatList(LIST_HOSTS, "or");
/** Extensions acceptées, telles qu'elles s'affichent dans les textes. */
export const LIST_FILE_EXTENSIONS_TEXT = formatList(LIST_FILE_EXTENSIONS, "or");

export const BAD_HOST_MESSAGE = `Seules les adresses GitHub sont acceptées (${LIST_HOSTS_TEXT}).`;
export const DOWNLOAD_ERROR = "Impossible de télécharger cette liste : vérifiez l'adresse.";
export const FILE_ERROR = "Impossible de lire ce fichier.";
export const TABLE_MESSAGE =
  "Ce fichier ressemble à un tableau à plusieurs colonnes : gardez une seule colonne, celle des comptes.";

export const PROSE_WARNING =
  "Ce contenu ressemble à du texte : chaque mot y deviendrait un compte à bloquer. Vérifiez l'aperçu avant d'activer.";
export const INVALID_WARNING = "Beaucoup d'entrées sont invalides : vérifiez que c'est bien une liste de comptes.";

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/** Adresse d'une liste : https, hôte exact, sans port ni identifiants. */
export function validateListUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: BAD_HOST_MESSAGE };
  }
  const allowed = url.protocol === "https:" && LIST_HOSTS.includes(url.host) && !url.username && !url.password;
  return allowed ? { ok: true, url: url.href } : { ok: false, reason: BAD_HOST_MESSAGE };
}

/**
 * Tableau à plusieurs colonnes : la plupart de ses lignes en ont plusieurs. Ses
 * cellules (noms, villes, nombres) seraient prises pour des comptes, et Barrage
 * bloquerait de vrais comptes sans rapport.
 */
export function looksLikeTable(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return false;
  const multi = lines.filter((line) => /\S\s*[,;\t]\s*\S/.test(line.trim())).length;
  return multi * 2 > lines.length;
}

/**
 * Texte libre : la plupart de ses lignes ont plusieurs mots, sans @ ni adresse.
 * Des noms ou des phrases seraient pris pour des comptes. Des comptes sans @
 * séparés par des espaces y ressemblent et restent un format accepté : ce
 * n'est qu'une mise en garde, à côté de l'aperçu.
 */
export function looksLikeProse(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const prose = lines.filter((line) => /\S\s+\S/.test(line.trim()) && !/[@/]/.test(line));
  return prose.length * 2 > lines.length;
}

/** Fichier local : extension et taille, avant toute lecture. Renvoie la raison d'un refus, sinon null. */
export function checkListFile(name: string, size: number): string | null {
  if (!LIST_FILE_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension))) {
    return `Seuls les fichiers ${formatList(LIST_FILE_EXTENSIONS, "and")} sont acceptés.`;
  }
  return size > LIST_MAX_BYTES ? `Ce fichier dépasse ${LIST_MAX_BYTES / 1_000_000} Mo.` : null;
}

export type ImportReport =
  | { ok: true; handles: string[]; duplicates: number; invalid: string[]; warning?: string }
  | { ok: false; reason: string };

/** Analyse le contenu d'une liste, fichier ou adresse GitHub. */
export function analyzeList(text: string): ImportReport {
  if (looksLikeTable(text)) return { ok: false, reason: TABLE_MESSAGE };
  const entries = splitEntries(text);
  // Avant l'analyse : un fichier de 1 Mo peut compter des centaines de milliers d'entrées.
  if (entries.length > LIST_MAX_SIZE) return { ok: false, reason: `Plus de ${formatCount(LIST_MAX_SIZE)} entrées dans cette liste.` };
  const { handles, invalid } = parseEntries(entries);
  if (!handles.length) return { ok: false, reason: "Aucun compte valide dans cette liste." };
  const warning = looksLikeProse(text)
    ? PROSE_WARNING
    : invalid.length > entries.length * IMPORT_MAX_INVALID_SHARE
      ? INVALID_WARNING
      : null;
  return {
    ok: true,
    handles,
    duplicates: entries.length - invalid.length - handles.length,
    invalid,
    ...(warning ? { warning } : {}),
  };
}

/** Compte rendu affiché après l'analyse. */
export function describeReport(report: Extract<ImportReport, { ok: true }>): string {
  const kept = plural(report.handles.length, "compte retenu", "comptes retenus");
  return `${kept}, ${plural(report.duplicates, "doublon")}, ${plural(report.invalid.length, "invalide")}.`;
}
