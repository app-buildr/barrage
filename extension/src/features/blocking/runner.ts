// Traitement de la liste depuis un onglet X connecté, puis arrêt. Il ne tourne
// que lorsqu'il y a du travail : au chargement de x.com, quand l'utilisateur
// modifie la liste ou les réglages, et quand un compte de la liste apparaît
// dans le fil (voir features/timeline).
//
// Plusieurs onglets X peuvent être ouverts, un seul travaille à la fois grâce à
// un verrou Web Locks, partagé par tous les onglets de l'origine. Les autres
// attendent leur tour : si l'onglet qui travaille est fermé, l'un d'eux reprend.
//
// Chaque compte X a sa propre file et ses propres résultats : le traitement
// suit le compte de la session, relu à chaque tour, puisque changer de compte
// sur x.com vaut pour tous les onglets.
import {
  AUDIT_INTERVAL_MS,
  AUTH_RETRY_MS,
  BLOCK_DELAY_MS,
  CHECK_RETRY_MS,
  DELAY_JITTER,
  MAX_CONSECUTIVE_FAILURES,
  MAX_PAUSE_MS,
  NETWORK_RETRY_MS,
} from "../../core/config.ts";
import {
  QUEUE_KEYS,
  accountsOf,
  getState,
  onStateChange,
  type BlockingError,
  type State,
} from "../../core/state.ts";
import {
  accountHandle,
  accountId,
  blockUser,
  lookupBlocking,
  pageAccount,
  sessionId,
  unblockUser,
} from "./api.ts";
import type { Lookup, Outcome } from "./outcome.ts";
import { nextAction, type Action } from "./plan.ts";
import type { Result, Results } from "./queue.ts";
import { write } from "../../core/write.ts";
import { recordAutomation, setError, setFailures, setPauseUntil, setResults } from "./store.ts";
import { contextAlive } from "../../core/context.ts";

/**
 * La page peut lire ce nom, et même tenir le verrou : le traitement attendrait
 * alors sans envoyer de requête.
 */
const LOCK_NAME = "barrage-queue";

/** Comptes vérifiés auprès de X par cet onglet, non bloqués à ce moment : horodatage de la vérification. */
const checked = new Map<string, number>();
/** Compte X pour lequel `checked` vaut. */
let checkedFor: string | null = null;

/** Dernier compte X (et son @) déclaré par cet onglet, voir ensureAccount. */
let ensured = "";

/**
 * Déclare le compte X de la session, s'il est nouveau ou n'est plus celui
 * affiché dans les options. Le @ vient de la barre latérale de la page : il
 * n'est fiable que si la session est restée sur le compte du chargement.
 * Une fois par compte et par onglet, sauf @ découvert entre-temps.
 */
async function ensureAccount(account: string): Promise<void> {
  const handle = account === pageAccount() ? accountHandle() : null;
  const key = `${account}@${handle ?? ""}`;
  if (key === ensured) return;
  const stored = await chrome.storage.local.get({ account: null, accounts: {} });
  const accounts = accountsOf(stored);
  const known = Object.hasOwn(accounts, account) ? accounts[account] : undefined;
  if (stored.account !== account || !known || (handle && known.handle !== handle)) {
    await write("useAccount", account, handle);
  }
  ensured = key;
}

/**
 * La session est passée sur un autre compte X depuis la lecture de l'état :
 * une requête envoyée maintenant viserait un autre compte que celui dont
 * l'état a été lu. Vérifié juste avant chaque requête, dont la réponse est
 * ensuite attribuée au compte lu : la session ne change pas entre la
 * vérification et l'envoi, faits d'un même trait.
 */
const switched = (state: State): boolean => accountId() !== state.account;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jittered(ms: number): number {
  return ms * (1 + (Math.random() * 2 - 1) * DELAY_JITTER);
}

type Next = { stop: true } | { stop: false; waitMs: number };

const STOP: Next = { stop: true };
/** Le traitement continue, après cette attente. */
const continueIn = (waitMs = 0): Next => ({ stop: false, waitMs });

/** Issue qui concerne tout le traitement, pas le compte visé. */
type GlobalOutcome = Extract<Outcome, { kind: "rate_limited" | "automation" | "broken" | "auth" | "network" }>;

const GLOBAL_KINDS: readonly string[] = ["rate_limited", "automation", "broken", "auth", "network"];

const isGlobal = (outcome: { kind: string }): outcome is GlobalOutcome => GLOBAL_KINDS.includes(outcome.kind);

/** X a changé : tout s'arrête, tentatives et files intactes, jusqu'à la reprise demandée dans les options. */
const stopBroken = (state: State, message: string): Promise<void> =>
  setError(state.prefix, `${message} Barrage s'est arrêté : X a peut-être changé.`, "api", Infinity);

async function handleGlobal(state: State, outcome: GlobalOutcome): Promise<Next> {
  switch (outcome.kind) {
    case "rate_limited":
      // Stocké, pour qu'un autre onglet qui reprendrait le verrou attende aussi.
      // La variation évite de reprendre à la seconde annoncée, jamais avant.
      await setPauseUntil(state.prefix, Math.min(outcome.until, Date.now() + MAX_PAUSE_MS) + jittered(BLOCK_DELAY_MS));
      return continueIn();
    case "automation":
      await recordAutomation(state.prefix, state.strikes, outcome.message);
      return STOP;
    case "broken":
      await stopBroken(state, outcome.message);
      return STOP;
    case "auth":
      // L'alerte reste affichée jusqu'à la reprise, voir authCleared.
      await setError(state.prefix, outcome.message, "auth", Infinity, (await sessionId()) ?? undefined);
      return STOP;
    case "network":
      await setError(state.prefix, `${outcome.message} Nouvel essai dans une minute.`, "network", NETWORK_RETRY_MS);
      return continueIn(NETWORK_RETRY_MS);
  }
}

/**
 * Demande à X l'état de blocage d'un paquet de comptes, ou décide de la suite
 * si la demande échoue : une limite, une session ou un réseau en cause valent
 * pour tout le traitement. Un autre refus renvoie `failed`, à traiter par l'appelant.
 */
async function lookup(state: State, batch: string[]): Promise<Lookup | Next | { failed: string }> {
  if (switched(state)) return continueIn();
  const reply = await lookupBlocking(batch);
  if (!("kind" in reply)) return reply;
  if (isGlobal(reply)) return handleGlobal(state, reply);
  return { failed: reply.message };
}

/**
 * Prochaine vérification de compte X permise à cet onglet, voir AUDIT_INTERVAL_MS.
 * Entre deux, blocages et déblocages continuent.
 */
let nextAuditAt = 0;

/**
 * Vérifie un paquet de comptes de la liste pour un compte X encore jamais
 * vérifié, voir State.audit. Lecture seule : rien n'est modifié côté X. Un
 * paquet refusé est abandonné sans rien changer : la vérification n'est
 * qu'une remise à niveau, elle ne doit pas arrêter le blocage.
 */
async function audit(state: State, batch: string[]): Promise<Next> {
  nextAuditAt = Date.now() + AUDIT_INTERVAL_MS;
  const reply = await lookup(state, batch);
  if ("stop" in reply) return reply;
  if ("failed" in reply) {
    console.warn("[Barrage] vérification du compte X abandonnée pour un paquet :", reply.failed);
    await write("recordAudit", batch, [], [], {}, state.account);
    return continueIn();
  }
  const at = Date.now();
  for (const handle of batch) if (reply.found.has(handle) && !reply.blocking.has(handle)) checked.set(handle, at);
  await write("recordAudit", batch, [...reply.found], [...reply.blocking], recovered(state), state.account);
  return continueIn();
}

/** Décision du moment pour cet état, voir plan.ts. */
const plan = (state: State): Action => nextAction(state, { now: Date.now(), checked, nextAuditAt });

/** Vérifie un paquet de comptes à bloquer : déjà bloqués, ou introuvables. */
async function check(state: State, batch: string[]): Promise<Next> {
  const reply = await lookup(state, batch);
  if ("stop" in reply) return reply;
  if ("failed" in reply) {
    // Sans vérification, on risquerait de rebloquer : on s'arrête, voir halted.
    const retry = `Nouvel essai au prochain compte vu, dans ${CHECK_RETRY_MS / 60_000} minutes au plus tôt.`;
    await setError(state.prefix, `Vérification impossible : ${reply.failed} ${retry}`, "other", Infinity);
    return STOP;
  }
  const at = Date.now();
  // Sans prototype : « __proto__ » est un identifiant X valide.
  const entries: Results = Object.create(null);
  for (const handle of batch) {
    if (reply.blocking.has(handle)) entries[handle] = { state: "already_blocked", at };
    else if (!reply.found.has(handle)) {
      entries[handle] = { state: "not_found", at, message: "Compte introuvable ou suspendu." };
    } else checked.set(handle, at);
  }
  await setResults(state.prefix, entries, recovered(state));
  await updateBadges("syncBadges", state);
  return continueIn();
}

/** Le résultat est enregistré : un badge manqué ne doit pas arrêter le traitement. */
async function updateBadges(name: "recordBlockSuccess" | "syncBadges", state: State): Promise<void> {
  await write(name, state.account).catch((err: unknown) => console.warn("[Barrage]", err));
}

/** L'appel a abouti : une erreur affichée n'est plus d'actualité. */
function recovered(state: State): Record<string, unknown> {
  return state.error ? { error: null } : {};
}

/** X a répondu sur ce compte : la série de refus s'arrête là. */
function answered(state: State): Record<string, unknown> {
  return { ...recovered(state), ...(state.failures.length ? { failures: [] } : {}) };
}

/** L'action a abouti : seul un blocage ou un déblocage réussi lève le soupçon d'automatisation. */
function succeeded(state: State): Record<string, unknown> {
  return { ...answered(state), ...(state.strikes ? { strikes: 0 } : {}) };
}

/** Refus de ce compte : au dernier permis, tout s'arrête sans le lui imputer. */
async function tripped(state: State, handle: string, message: string): Promise<boolean> {
  const failures = [...new Set([...state.failures, handle])];
  await setFailures(state.prefix, failures);
  if (failures.length < MAX_CONSECUTIVE_FAILURES) return false;
  await stopBroken(state, `${failures.length} comptes refusés de suite (${message}).`);
  return true;
}

async function block(state: State, handle: string): Promise<Next> {
  if (switched(state)) return continueIn();
  const outcome = await blockUser(handle);
  if (isGlobal(outcome)) return handleGlobal(state, outcome);

  const at = Date.now();
  if (outcome.kind === "ok") {
    await setResults(state.prefix, { [handle]: { state: "blocked", at } }, succeeded(state));
    await updateBadges("recordBlockSuccess", state);
  } else if (outcome.kind === "not_found") {
    const result: Result = { state: "not_found", at, message: outcome.message };
    await setResults(state.prefix, { [handle]: result }, answered(state));
  } else {
    if (await tripped(state, handle, outcome.message)) return STOP;
    await write("recordBlockFailure", handle, outcome.message, at, state.account);
  }
  // Le délai entre deux blocages ne se raccourcit pas quand la liste change.
  return continueIn(jittered(BLOCK_DELAY_MS));
}

/** Débloque un compte désactivé par l'utilisateur après que Barrage l'a bloqué. */
async function unblock(state: State, handle: string): Promise<Next> {
  if (switched(state)) return continueIn();
  const outcome = await unblockUser(handle);
  if (isGlobal(outcome)) return handleGlobal(state, outcome);

  const at = Date.now();
  if (outcome.kind === "failed") {
    if (await tripped(state, handle, outcome.message)) return STOP;
    await write("refuseUnblock", handle, outcome.message, state.account);
  } else {
    const result: Result =
      outcome.kind === "ok" ? { state: "unblocked", at } : { state: "not_found", at, message: outcome.message };
    await write("finishUnblock", handle, result, outcome.kind === "ok" ? succeeded(state) : answered(state), state.account);
  }
  return continueIn(jittered(BLOCK_DELAY_MS));
}

/** Un tour : l'action décidée par nextAction, voir plan.ts. */
async function step(): Promise<Next> {
  const account = accountId();
  // Sans compte X connecté, rien n'est possible. La connexion recharge x.com,
  // ce qui relance le traitement.
  if (!account) return STOP;
  await ensureAccount(account);
  if (account !== checkedFor) {
    checked.clear();
    checkedFor = account;
  }
  const state = await getState(account);
  const action = plan(state);
  switch (action.kind) {
    case "stop":
      return STOP;
    case "wait":
      return continueIn(action.ms);
    case "audit":
      return audit(state, action.batch);
    case "unblock":
      return unblock(state, action.handle);
    case "check":
      return check(state, action.batch);
    case "block":
      return block(state, action.handle);
  }
}

async function run(): Promise<void> {
  while (contextAlive()) {
    let next: Next;
    try {
      next = await step();
    } catch (err) {
      // Contexte invalidé en cours de route : on rend le verrou à un onglet sain.
      if (!contextAlive()) return;
      console.error("[Barrage]", err);
      next = continueIn(NETWORK_RETRY_MS);
    }
    if (next.stop) return;
    await sleep(next.waitMs);
  }
}

let running = false;
/** Une modification est arrivée pendant le traitement : refaire un passage. */
let dirty = false;

/**
 * Erreur de session : ne reprendre qu'au chargement de x.com, avec une
 * nouvelle session (reconnexion) ou après AUTH_RETRY_MS. Un compte verrouillé
 * garde son cookie, sa présence ne prouve rien.
 */
async function authCleared(error: BlockingError, pageLoad: boolean): Promise<boolean> {
  if (!pageLoad) return false;
  const session = await sessionId();
  if (!session) return false;
  const renewed = error.session !== undefined && error.session !== session;
  return renewed || Date.now() - (error.at ?? 0) >= AUTH_RETRY_MS;
}

async function start(pageLoad = false): Promise<void> {
  dirty = true;
  if (running) return;
  const account = accountId();
  if (!account) return;
  await ensureAccount(account);
  let state = await getState(account);
  if (state.error?.reason === "auth") {
    if (!(await authCleared(state.error, pageLoad))) return;
    await setError(state.prefix, null);
    state = { ...state, error: null };
  }
  if (plan(state).kind === "stop") return;
  if (running) return; // un autre appel a démarré pendant la lecture
  running = true;
  // Sans ifAvailable : un onglet qui ne travaille pas attend le verrou, et
  // reprend la file si l'onglet qui la traitait est fermé.
  void navigator.locks
    .request(LOCK_NAME, async () => {
      while (dirty && contextAlive()) {
        dirty = false;
        await run();
      }
    })
    .finally(() => {
      running = false;
    });
}

/** Traite la file maintenant, puis à chaque modification qui la concerne. */
export function startRunner(): void {
  onStateChange(() => void start(), QUEUE_KEYS);
  void start(true);
}
