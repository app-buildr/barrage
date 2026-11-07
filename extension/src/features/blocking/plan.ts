// Décision du traitement : que faire maintenant, d'après l'état stocké.
// Fonctions pures, testées dans tests/plan.test.ts. L'exécution et le verrou
// vivent dans runner.ts, qui ne décide rien par lui-même.
import {
  ACTIONS_WINDOW_MS,
  AUDIT_INTERVAL_MS,
  AUTOMATION_PAUSE_MS,
  BLOCK_DELAY_MS,
  CHECK_MAX_AGE_MS,
  CHECK_RETRY_MS,
  DELAY_JITTER,
  LOOKUP_BATCH,
  LOOKUP_BUDGET,
  LOOKUP_WINDOW_MS,
  MAX_ACTIONS_PER_HOUR,
  MAX_PAUSE_MS,
} from "../../core/config.ts";
import { queueOrder, unblockQueue, type BlockingError, type State } from "../../core/state.ts";
import { nextPending, uncheckedPending } from "./queue.ts";

export type Action =
  | { kind: "stop" }
  | { kind: "wait"; ms: number }
  | { kind: "audit"; batch: string[] }
  | { kind: "unblock"; handle: string }
  | { kind: "check"; batch: string[] }
  | { kind: "block"; handle: string };

export type PlanContext = {
  now: number;
  /** Horodatage de la dernière vérification par cet onglet, par compte. */
  checked: ReadonlyMap<string, number>;
};

/** Erreur affichée jusqu'à sa résolution, voir setError. */
const permanent = (error: BlockingError): boolean => error.staleAt >= Number.MAX_SAFE_INTEGER;

/**
 * L'erreur interdit toute requête à X. Seule une panne passagère laisse
 * continuer ; une raison inconnue arrête, par prudence. Un échec de
 * vérification ne se retente qu'après CHECK_RETRY_MS.
 */
export function halted(error: BlockingError | null, now: number): boolean {
  if (!error || error.reason === "network") return false;
  if (error.reason !== "other") return true;
  return permanent(error) && now - (error.at ?? 0) < CHECK_RETRY_MS;
}

/** Arrêt levé par un clic dans les options. Une erreur de session se lève en se reconnectant à x.com. */
export const resumable = (error: BlockingError | null): boolean =>
  error?.reason === "automation" || error?.reason === "api";

/** Pause après un soupçon d'automatisation, doublée à chaque rechute. */
export const automationPause = (strikes: number): number => Math.min(MAX_PAUSE_MS, AUTOMATION_PAUSE_MS * 2 ** strikes);

/** Requêtes de `times` encore dans la fenêtre. */
export const withinWindow = (times: readonly number[], windowMs: number, now: number): number[] =>
  times.filter((at) => now - at < windowMs);

/** Attente avant que `limit` requêtes sur `windowMs` laissent de la place. `times` est trié. */
function windowDelay(times: readonly number[], limit: number, windowMs: number, now: number): number {
  const recent = withinWindow(times, windowMs, now);
  const oldest = recent[recent.length - limit];
  return oldest === undefined ? 0 : oldest + windowMs - now;
}

/** Plus petit écart permis entre deux actions : le délai, variation comprise. */
const MIN_ACTION_GAP_MS = BLOCK_DELAY_MS * (1 - DELAY_JITTER);

/**
 * Attente avant le prochain blocage ou déblocage, d'après le stockage :
 * recharger l'onglet ou passer à un autre n'annule ni le délai ni le plafond.
 */
export function actionDelay(actions: readonly number[], now: number): number {
  const spacing = (actions.at(-1) ?? -Infinity) + MIN_ACTION_GAP_MS - now;
  return Math.max(spacing, windowDelay(actions, MAX_ACTIONS_PER_HOUR, ACTIONS_WINDOW_MS, now), 0);
}

/** Le plafond horaire retient les actions, bien au-delà du délai entre deux. */
export const actionsCapped = (actions: readonly number[], now: number): boolean =>
  actionDelay(actions, now) > BLOCK_DELAY_MS;

/** Attente avant le prochain friendships/lookup : budget partagé, ou quota épuisé d'après X. */
export function lookupDelay({ lookups, lookupPauseUntil }: Pick<State, "lookups" | "lookupPauseUntil">, now: number): number {
  return Math.max(windowDelay(lookups, LOOKUP_BUDGET, LOOKUP_WINDOW_MS, now), lookupPauseUntil - now, 0);
}

/**
 * Prochaine action : une vérification du compte X, un déblocage, une
 * vérification, un blocage, ou l'arrêt. Sans compte à vérifier, à débloquer ni
 * à bloquer (vu dans le fil ou demandé à la main), rien : ni requête à X, ni
 * écriture.
 *
 * Une action ne part qu'une fois son délai écoulé. Une vérification avant
 * blocage attend aussi qu'un blocage soit possible : faite plus tôt, elle serait
 * périmée avant de servir. Elle passe avant celle du compte X, qui n'est qu'une
 * remise à niveau et se contente du budget restant.
 */
export function nextAction(state: State, { now, checked }: PlanContext): Action {
  if (halted(state.error, now)) return { kind: "stop" };
  // Les déblocages demandés passent avant tout nouveau blocage.
  const toUnblock = unblockQueue(state, now)[0];
  const order = queueOrder(state);
  const toBlock = nextPending(order, state.results);
  if (!toUnblock && !toBlock && !state.audit.length) return { kind: "stop" };

  const remaining = state.pauseUntil - now;
  if (remaining > 0) return { kind: "wait", ms: remaining };

  const lookupWait = lookupDelay(state, now);
  const actionWait = actionDelay(state.actions, now);
  const unchecked = toBlock ? uncheckedPending(order, state.results, checked, now, CHECK_MAX_AGE_MS) : [];
  const checkDue = !toUnblock && unchecked.length > 0 && actionWait <= 0;

  // La vérification du compte X passe en premier quand elle est due, sans
  // retenir les blocages et déblocages entre deux paquets.
  const lastLookup = state.lookups.at(-1) ?? -Infinity;
  const auditWait = state.audit.length ? Math.max(lastLookup + AUDIT_INTERVAL_MS - now, lookupWait, 0) : Infinity;
  if (auditWait <= 0 && !checkDue) return { kind: "audit", batch: state.audit.slice(0, LOOKUP_BATCH) };
  if (toUnblock && actionWait <= 0) return { kind: "unblock", handle: toUnblock };
  if (!toUnblock && !toBlock) return { kind: "wait", ms: auditWait };
  if (toUnblock || actionWait > 0) return { kind: "wait", ms: Math.min(actionWait, auditWait) };

  if (!unchecked.length) return { kind: "block", handle: toBlock as string };
  if (lookupWait > 0) return { kind: "wait", ms: lookupWait };
  return { kind: "check", batch: unchecked.slice(0, LOOKUP_BATCH) };
}
