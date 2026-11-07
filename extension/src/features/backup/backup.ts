// Sauvegarde de l'état dans un fichier JSON : ce que X ne peut pas rendre
// (qui a bloqué quoi, listes personnelles, réglages, badges). Fonctions pures,
// testées dans tests/backup.test.ts. Files, pauses, erreurs et listes reçues de
// GitHub n'y figurent pas : une restauration ne doit lancer aucune requête à X
// de plus, et les listes en ligne repassent par leurs gardes.
import { LIST_MAX_SIZE } from "../../core/config.ts";
import { plural } from "../../core/format.ts";
import { isResult } from "../blocking/queue.ts";
import { parseHandle } from "../lists/handles.ts";
import { validateListUrl } from "../lists/import.ts";
import { readLists, type ListDef } from "../lists/lists.ts";

const APP = "barrage";
const FORMAT = 1;

/** Taille maximale d'un fichier de sauvegarde. */
export const BACKUP_MAX_BYTES = 10_000_000;

/** Clé d'un champ propre à un compte X, voir ACCOUNT_FIELDS. */
const ACCOUNT_KEY_RE = /^(?:acct:\d+\/)?(blockCount|badges|badgeNotified)$/;
const RESULT_KEY_RE = /^(?:acct:\d+\/)?result:(.+)$/;
const ACCOUNT_ID_RE = /^\d+$/;

const SHARED_KEYS = ["lists", "onboarded", "disabled", "notify", "notifyBadges", "account", "legacy", "accounts"];

/** Clé qui entre dans une sauvegarde. */
const backedUp = (key: string): boolean =>
  SHARED_KEYS.includes(key) || ACCOUNT_KEY_RE.test(key) || RESULT_KEY_RE.test(key);

export type Backup = { app: string; format: number; version: string; exportedAt: number; data: Record<string, unknown> };

export function createBackup(stored: Record<string, unknown>, version: string, now: number): Backup {
  const data = Object.fromEntries(Object.entries(stored).filter(([key]) => backedUp(key)));
  return { app: APP, format: FORMAT, version, exportedAt: now, data };
}

export const backupFileName = (now: number): string =>
  `barrage-sauvegarde-${new Date(now).toISOString().slice(0, 10)}.json`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Comptes valides d'un tableau, sans doublon. */
function handlesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((h) => (typeof h === "string" ? parseHandle(h) : null)).filter((h) => h !== null))];
}

/** Listes valides : comptes relus, adresses revérifiées, liste trop grosse écartée. */
function cleanLists(value: unknown): ListDef[] {
  return readLists(value)
    .map((list) => ({ ...list, handles: handlesOf(list.handles) }))
    .filter((list) => list.handles.length <= LIST_MAX_SIZE)
    .filter((list) => list.source !== "github" || validateListUrl(list.url).ok);
}

function cleanAccounts(value: unknown): Record<string, { handle?: string }> {
  if (!isRecord(value)) return {};
  const accounts = Object.entries(value).filter(([id, account]) => ACCOUNT_ID_RE.test(id) && isRecord(account));
  return Object.fromEntries(
    accounts.map(([id, account]) => {
      const handle = typeof (account as { handle?: unknown }).handle === "string"
        ? parseHandle((account as { handle: string }).handle)
        : null;
      return [id, handle ? { handle } : {}];
    }),
  );
}

/** Valeur relue d'une clé, ou undefined si elle n'est pas exploitable. */
function cleanValue(key: string, value: unknown): unknown {
  switch (key) {
    case "lists":
      return cleanLists(value);
    case "disabled":
      return handlesOf(value);
    case "accounts":
      return cleanAccounts(value);
    case "account":
    case "legacy":
      return typeof value === "string" && ACCOUNT_ID_RE.test(value) ? value : undefined;
    case "onboarded":
    case "notify":
    case "notifyBadges":
      return typeof value === "boolean" ? value : undefined;
  }
  const field = ACCOUNT_KEY_RE.exec(key)?.[1];
  if (field === "badges") return isRecord(value) && Object.values(value).every(isCount) ? value : undefined;
  if (field) return isCount(value) ? value : undefined;
  const handle = RESULT_KEY_RE.exec(key)?.[1];
  return handle && parseHandle(handle) === handle && isResult(value) ? value : undefined;
}

export type BackupCheck =
  | { ok: true; data: Record<string, unknown>; exportedAt: number; ignored: number }
  | { ok: false; reason: string };

export const BACKUP_INVALID = "Ce fichier n'est pas une sauvegarde de Barrage.";

/**
 * Relit un fichier de sauvegarde, écrit à la main ou modifié peut-être : seules
 * les clés connues et les valeurs valides passent, le reste est compté.
 */
export function checkBackup(backup: unknown): BackupCheck {
  if (!isRecord(backup) || backup.app !== APP || !isRecord(backup.data)) return { ok: false, reason: BACKUP_INVALID };
  if (backup.format !== FORMAT) return { ok: false, reason: "Cette sauvegarde vient d'une version de Barrage que celle-ci ne sait pas lire." };
  const data: Record<string, unknown> = {};
  let ignored = 0;
  for (const [key, value] of Object.entries(backup.data)) {
    const clean = backedUp(key) ? cleanValue(key, value) : undefined;
    if (clean === undefined) ignored++;
    else data[key] = clean;
  }
  if (!Object.keys(data).length) return { ok: false, reason: "Cette sauvegarde ne contient rien d'exploitable." };
  return { ok: true, data, exportedAt: isCount(backup.exportedAt) ? backup.exportedAt : 0, ignored };
}

/** Résumé montré avant de restaurer. */
export function describeBackup({ data, ignored }: Extract<BackupCheck, { ok: true }>): string {
  const lists = Array.isArray(data.lists) ? data.lists.length : 0;
  const results = Object.keys(data).filter((key) => RESULT_KEY_RE.test(key)).length;
  const accounts = isRecord(data.accounts) ? Object.keys(data.accounts).length : 0;
  const parts = [plural(lists, "liste"), plural(results, "résultat"), plural(accounts, "compte X")];
  return `${parts.join(", ")}${ignored ? `, ${plural(ignored, "entrée ignorée", "entrées ignorées")}` : ""}.`;
}

export type Restore = { ok: true } | { ok: false; reason: string };

export const BACKUP_OTHER_ACCOUNT =
  "Cette sauvegarde vient d'un autre premier compte X que celui de cette installation : la restaurer mêlerait leurs états.";

/**
 * Valeurs à écrire pour restaurer `data` par-dessus l'état `stored`, sans rien
 * effacer : les listes de la sauvegarde remplacent celles de même identifiant,
 * un résultat déjà connu ici reste, plus récent, et les compteurs gardent le
 * plus haut.
 */
export function mergeBackup(stored: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof stored.legacy === "string" && typeof data.legacy === "string" && stored.legacy !== data.legacy) return null;
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const current = stored[key];
    if (RESULT_KEY_RE.test(key) || key === "account" || key === "legacy") {
      if (current === undefined) values[key] = value;
    } else if (key === "lists") {
      const ids = new Set((value as ListDef[]).map((list) => list.id));
      values.lists = [...(value as ListDef[]), ...readLists(current).filter((list) => !ids.has(list.id))];
    } else if (key === "disabled") {
      values.disabled = [...new Set([...(Array.isArray(current) ? current : []), ...(value as string[])])];
    } else if (key === "accounts" || ACCOUNT_KEY_RE.exec(key)?.[1] === "badges") {
      values[key] = { ...(value as object), ...(isRecord(current) ? current : {}) };
    } else if (ACCOUNT_KEY_RE.test(key)) {
      values[key] = Math.max(value as number, isCount(current) ? current : 0);
    } else if (key === "onboarded") {
      values.onboarded = value === true || current === true;
    } else values[key] = value;
  }
  return values;
}
