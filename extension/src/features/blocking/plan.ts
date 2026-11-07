// Décision du traitement : que faire maintenant, d'après l'état stocké.
// Fonctions pures, testées dans tests/plan.test.ts. L'exécution et le verrou
// vivent dans runner.ts, qui ne décide rien par lui-même.
import { AUTOMATION_PAUSE_MS, CHECK_MAX_AGE_MS, CHECK_RETRY_MS, LOOKUP_BATCH, MAX_PAUSE_MS } from "../../core/config.ts";
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
  /** Prochaine vérification de compte X permise à cet onglet. */
  nextAuditAt: number;
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

/**
 * Prochaine action : une vérification du compte X, un déblocage, une
 * vérification, un blocage, ou l'arrêt. Sans compte à vérifier, à débloquer ni
 * à bloquer (vu dans le fil ou demandé à la main), rien : ni requête à X, ni
 * écriture.
 */
export function nextAction(state: State, { now, checked, nextAuditAt }: PlanContext): Action {
  if (halted(state.error, now)) return { kind: "stop" };
  // Les déblocages demandés passent avant tout nouveau blocage.
  const toUnblock = unblockQueue(state, now)[0];
  const order = queueOrder(state);
  const toBlock = nextPending(order, state.results);
  if (!toUnblock && !toBlock && !state.audit.length) return { kind: "stop" };

  const remaining = state.pauseUntil - now;
  if (remaining > 0) return { kind: "wait", ms: remaining };

  // La vérification du compte X passe en premier quand elle est due, sans
  // retenir les blocages et déblocages entre deux paquets.
  const auditWait = nextAuditAt - now;
  if (state.audit.length && auditWait <= 0) return { kind: "audit", batch: state.audit.slice(0, LOOKUP_BATCH) };
  if (toUnblock) return { kind: "unblock", handle: toUnblock };
  if (!toBlock) return { kind: "wait", ms: auditWait };

  const unchecked = uncheckedPending(order, state.results, checked, now, CHECK_MAX_AGE_MS);
  if (unchecked.length) return { kind: "check", batch: unchecked.slice(0, LOOKUP_BATCH) };
  return { kind: "block", handle: toBlock };
}
