// Lecture de la liste collaborative reçue de GitHub et calcul de ce qui change.
// Fonctions pures, testées dans tests/lists.test.ts.
import {
  LIST_BASELINE_MS,
  LIST_GUARD_FLOOR,
  LIST_MAX_ADDED_SHARE,
  LIST_MAX_REMOVED_SHARE,
  LIST_MAX_SIZE,
} from "../../core/config.ts";
import { parseEntries } from "./handles.ts";

export type Parsed = { ok: true; handles: string[] } | { ok: false; reason: string };

/**
 * Valide le contenu d'un fichier de liste : un tableau d'identifiants. Les
 * entrées invalides sont écartées une à une ; un fichier vide, trop gros ou
 * qui n'est pas un tableau est refusé en entier.
 */
export function parseList(body: unknown): Parsed {
  if (!Array.isArray(body)) return { ok: false, reason: "le fichier n'est pas une liste" };
  if (body.length > LIST_MAX_SIZE) return { ok: false, reason: `plus de ${LIST_MAX_SIZE} comptes` };
  const { handles } = parseEntries(body.filter((entry) => typeof entry === "string"));
  if (!handles.length) return { ok: false, reason: "liste vide" };
  return { ok: true, handles };
}

export type Update = { ok: true; removed: string[] } | { ok: false; reason: string };

const withinLimit = (count: number, size: number, share: number): boolean =>
  count <= Math.max(LIST_GUARD_FLOOR, size * share);

/** Raison de refuser `next` par rapport à la liste `reference`, ou null. */
function overLimit(reference: readonly string[], next: readonly string[], kept: ReadonlySet<string>): string | null {
  const known = new Set(reference);
  const removed = reference.filter((h) => !kept.has(h)).length;
  const added = next.filter((h) => !known.has(h)).length;
  if (!withinLimit(removed, reference.length, LIST_MAX_REMOVED_SHARE)) {
    return `${removed} comptes retirés d'un coup sur ${reference.length}`;
  }
  if (!withinLimit(added, reference.length, LIST_MAX_ADDED_SHARE)) {
    return `${added} comptes ajoutés d'un coup à ${reference.length}`;
  }
  return null;
}

/**
 * Compare la liste en place à la nouvelle. `removed` : comptes qui en sortent,
 * sauf ceux encore couverts par une autre liste active (`covered`). Ceux que
 * Barrage a bloqués sont à débloquer, voir blockedByBarrage.
 *
 * La nouvelle liste est refusée si elle s'écarte trop de toutes les références,
 * pas de la liste en place : un retour à la référence passe toujours, même
 * après un gros ajout, et des retraits enchaînés se cumulent. Une liste
 * identique à celle en place ne change rien et passe aussi.
 * @param references listes de confiance, voir guardReferences
 */
export function compareLists(
  current: readonly string[],
  next: readonly string[],
  covered: readonly string[],
  references: ReadonlyArray<readonly string[]> = [current],
): Update {
  const kept = new Set([...next, ...covered]);
  const removed = current.filter((h) => !kept.has(h));
  const known = new Set(current);
  if (!removed.length && next.every((h) => known.has(h))) return { ok: true, removed };
  const refusals = references.map((reference) => overLimit(reference, next, kept));
  if (refusals.includes(null)) return { ok: true, removed };
  return { ok: false, reason: refusals[0] ?? "liste refusée" };
}

/** Mise à jour refusée. Sans `handles`, elle ne peut pas être acceptée : fichier invalide ou trop gros. */
export type PendingList = { reason: string; at: number; handles?: string[] };

/** Garde d'une liste en ligne, voir compareLists. */
export type ListGuard = {
  /** Référence, renouvelée tous les LIST_BASELINE_MS. */
  baseline: string[];
  baselineAt: number;
  /** Référence d'avant une confirmation : revenir en arrière reste possible. */
  rollback?: string[];
  pending?: PendingList;
};

function readPending(value: unknown): PendingList | null {
  const pending = value as Partial<PendingList> | null;
  if (typeof pending !== "object" || pending === null) return null;
  if (typeof pending.reason !== "string" || typeof pending.at !== "number") return null;
  const handles = Array.isArray(pending.handles) ? pending.handles.filter((h) => typeof h === "string") : null;
  return { reason: pending.reason, at: pending.at, ...(handles ? { handles } : {}) };
}

/** Gardes enregistrées, valeurs corrompues écartées : la référence sera refaite. */
export function readGuards(value: unknown): Record<string, ListGuard> {
  const guards: Record<string, ListGuard> = Object.create(null);
  if (typeof value !== "object" || value === null) return guards;
  for (const [id, entry] of Object.entries(value)) {
    const guard = entry as Partial<ListGuard> | null;
    if (!Array.isArray(guard?.baseline) || typeof guard.baselineAt !== "number") continue;
    const pending = readPending(guard.pending);
    guards[id] = {
      baseline: guard.baseline.filter((h) => typeof h === "string"),
      baselineAt: guard.baselineAt,
      ...(Array.isArray(guard.rollback) ? { rollback: guard.rollback.filter((h) => typeof h === "string") } : {}),
      ...(pending ? { pending } : {}),
    };
  }
  return guards;
}

/** Garde à jour : sans référence, ou passé LIST_BASELINE_MS, la liste en place en devient une. */
export function renewGuard(guard: ListGuard | undefined, current: readonly string[], now: number): ListGuard {
  if (guard && now - guard.baselineAt < LIST_BASELINE_MS) return guard;
  return { baseline: [...current], baselineAt: now, ...(guard?.pending ? { pending: guard.pending } : {}) };
}

/** Listes de confiance d'une garde. */
export const guardReferences = ({ baseline, rollback }: ListGuard): string[][] =>
  rollback ? [baseline, rollback] : [baseline];

/** Mise à jour acceptée : plus rien n'attend. */
export function settledGuard({ pending: _pending, ...guard }: ListGuard): ListGuard {
  return guard;
}

/** Mise à jour confirmée dans les options : elle devient la référence, l'ancienne permet le retour arrière. */
export function confirmedGuard(guard: ListGuard, handles: readonly string[], now: number): ListGuard {
  return { baseline: [...handles], baselineAt: now, rollback: guard.baseline };
}
