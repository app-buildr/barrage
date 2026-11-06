// Import d'une liste : validation de l'adresse et analyse du contenu, traité
// comme du texte. Fonctions pures, testées dans tests/multi-lists.test.ts.
import { LIST_FILE_EXTENSIONS, LIST_HOSTS, LIST_HOSTS_TEXT, LIST_MAX_BYTES, LIST_MAX_SIZE } from "../../core/config.ts";
import { plural } from "../../core/format.ts";
import { parseInput, splitEntries } from "./handles.ts";

export const BAD_HOST_MESSAGE = `Seules les adresses GitHub sont acceptées (${LIST_HOSTS_TEXT}).`;
export const DOWNLOAD_ERROR = "Impossible de télécharger cette liste : vérifiez l'adresse.";
export const FILE_ERROR = "Impossible de lire ce fichier.";
export const TABLE_MESSAGE =
  "Ce fichier ressemble à un tableau à plusieurs colonnes : gardez une seule colonne, celle des comptes.";

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

/** Fichier local : extension et taille, avant toute lecture. Renvoie la raison d'un refus, sinon null. */
export function checkListFile(name: string, size: number): string | null {
  if (!LIST_FILE_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension))) {
    return `Seuls les fichiers ${LIST_FILE_EXTENSIONS.join(" et ")} sont acceptés.`;
  }
  return size > LIST_MAX_BYTES ? `Ce fichier dépasse ${LIST_MAX_BYTES / 1_000_000} Mo.` : null;
}

export type ImportReport =
  | { ok: true; handles: string[]; duplicates: number; invalid: string[] }
  | { ok: false; reason: string };

/** Analyse le contenu d'une liste, fichier ou adresse GitHub. */
export function analyzeList(text: string): ImportReport {
  if (looksLikeTable(text)) return { ok: false, reason: TABLE_MESSAGE };
  const entries = splitEntries(text);
  // Avant l'analyse : un fichier de 1 Mo peut compter des centaines de milliers d'entrées.
  if (entries.length > LIST_MAX_SIZE) return { ok: false, reason: `Plus de ${LIST_MAX_SIZE} entrées dans cette liste.` };
  const { handles, invalid } = parseInput(text);
  if (!handles.length) return { ok: false, reason: "Aucun compte valide dans cette liste." };
  return { ok: true, handles, duplicates: entries.length - invalid.length - handles.length, invalid };
}

/** Compte rendu affiché après l'analyse. */
export function describeReport(report: Extract<ImportReport, { ok: true }>): string {
  const kept = plural(report.handles.length, "compte retenu", "comptes retenus");
  return `${kept}, ${plural(report.duplicates, "doublon")}, ${plural(report.invalid.length, "invalide")}.`;
}
