// Vérification d'un compte X auprès de X (voir State.audit), telle que la
// carte de progression l'affiche : à la première connexion, Barrage repère
// parmi les comptes de ses listes ceux que l'utilisateur bloquait déjà.
import { AUDIT_INTERVAL_MS, LOOKUP_BATCH, LOOKUP_BUDGET, LOOKUP_WINDOW_MS } from "../../core/config.ts";
import type { State } from "../../core/state.ts";
import { halted, listKnown, lookupDelay } from "../blocking/plan.ts";
import { activeHandles, nextPending, queueOrder } from "../blocking/queue.ts";

/** Écart moyen entre deux paquets : le plus lent du délai minimal et du budget de lookup. */
const BATCH_GAP_MS = Math.max(AUDIT_INTERVAL_MS, LOOKUP_WINDOW_MS / LOOKUP_BUDGET);

/** Ce qui retient la vérification : pas d'onglet x.com connecté, limite de X, ou arrêt du blocage. */
export type SyncPause = { reason: "no_tab" } | { reason: "limit"; until: number } | { reason: "error" };

type Progress = { checked: number; total: number };

export type SyncStatus =
  /** Aucun compte X vu sur x.com : la vérification n'a pas commencé. */
  | { kind: "no_account" }
  /**
   * `minutesLeft` suppose que les paquets partent dès que le budget le permet ;
   * `atLeast` : des blocages en attente prennent aussi sur ce budget.
   */
  | ({ kind: "syncing"; minutesLeft: number; atLeast: boolean } & Progress)
  | ({ kind: "paused"; pause: SyncPause } & Progress);

/**
 * @param working un onglet x.com connecté peut traiter la file ; null : pas encore vérifié
 * @returns null s'il n'y a rien à vérifier, ou que la vérification est terminée
 */
export function syncStatus(state: State, working: boolean | null, now: number): SyncStatus | null {
  const handles = activeHandles(state.handles, state.disabled);
  if (!handles.length) return null;
  if (!state.account) return { kind: "no_account" };
  // Un compte désactivé ou sorti de la liste peut rester dans la file : il ne compte pas.
  const audit = new Set(state.audit);
  const left = handles.filter((h) => audit.has(h)).length;
  if (!left) return null;
  const progress = { checked: handles.length - left, total: handles.length };

  if (halted(state.error, now)) return { kind: "paused", pause: { reason: "error" }, ...progress };
  const until = Math.max(state.pauseUntil, state.lookupPauseUntil);
  if (until > now) return { kind: "paused", pause: { reason: "limit", until }, ...progress };
  if (working === false) return { kind: "paused", pause: { reason: "no_tab" }, ...progress };

  const lastLookup = state.lookups.at(-1) ?? -Infinity;
  const firstWait = Math.max(lastLookup + AUDIT_INTERVAL_MS - now, lookupDelay(state, now), 0);
  const ms = firstWait + (Math.ceil(left / LOOKUP_BATCH) - 1) * BATCH_GAP_MS;
  const blocking = listKnown(state) && nextPending(queueOrder(state), state.results) !== undefined;
  return { kind: "syncing", minutesLeft: Math.max(1, Math.ceil(ms / 60_000)), atLeast: blocking, ...progress };
}
