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
  AUTH_RETRY_MS,
  BLOCK_DELAY_MS,
  DELAY_JITTER,
  MAX_CONSECUTIVE_FAILURES,
  MAX_PAUSE_MS,
  NETWORK_RETRY_MS,
  SLEEP_SLICE_MS,
} from "../../core/config.ts";
import {
  QUEUE_KEYS,
  accountsOf,
  coalesced,
  getState,
  onStateChange,
  type BlockingError,
  type ErrorCause,
  type State,
} from "../../core/state.ts";
import { accountHandle, accountId, pageAccount, sessionId } from "../x/session.ts";
import { blockUser, lookupBlocking, unblockUser } from "./api.ts";
import { failureOf, type Failure, type Lookup, type Outcome } from "./outcome.ts";
import { nextAction, type Action } from "./plan.ts";
import type { Result, Results } from "./queue.ts";
import { write } from "../../core/write.ts";
import { clearedValues, recordAutomation, setError, setFailures, setPauseUntil, setResults, type Cleared } from "./store.ts";
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

/**
 * Note la requête avant de l'envoyer, voir recordRequest, puis vérifie que la
 * session n'a pas changé : l'envoi suit d'un même trait. Faux : rien ne part.
 */
async function clearedToSend(state: State, kind: "action" | "lookup"): Promise<boolean> {
  if (switched(state)) return false;
  await write("recordRequest", kind, state.account);
  return !switched(state);
}

/**
 * Cette page a rouvert le traitement sur une session renouvelée, et X n'a pas
 * encore répondu : un nouveau refus viendrait d'autre chose que de la session.
 */
let reconnected = false;

/** Codes qu'un changement du jeton web de X donnerait, sur toute session. */
const TOKEN_CODES: readonly string[] = ["session_expired", "token_invalid", "token_expired"];

/**
 * Attend `ms`, ou moins si l'extension a été rechargée. L'horloge décide de la
 * fin : Chrome ralentit les minuteurs d'un onglet caché, des tranches comptées
 * une à une allongeraient d'autant une longue pause.
 */
async function sleep(ms: number): Promise<void> {
  const end = Date.now() + ms;
  do {
    const slice = Math.min(Math.max(end - Date.now(), 0), SLEEP_SLICE_MS);
    await new Promise((resolve) => setTimeout(resolve, slice));
  } while (Date.now() < end && contextAlive());
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
const stopBroken = (state: State, cause: ErrorCause): Promise<void> =>
  setError(state.prefix, cause, "api", Infinity);

async function handleGlobal(state: State, outcome: GlobalOutcome): Promise<Next> {
  switch (outcome.kind) {
    case "rate_limited":
      // Stocké, pour qu'un autre onglet qui reprendrait le verrou attende aussi.
      // La variation évite de reprendre à la seconde annoncée, jamais avant.
      await setPauseUntil(state.prefix, Math.min(outcome.until, Date.now() + MAX_PAUSE_MS) + jittered(BLOCK_DELAY_MS));
      return continueIn();
    case "automation":
      await recordAutomation(state.prefix, state.strikes, failureOf(outcome));
      return STOP;
    case "broken":
      await stopBroken(state, { ...failureOf(outcome), context: "stopped" });
      return STOP;
    case "auth":
      // L'alerte reste affichée jusqu'à la reprise, voir authResume.
      await setError(
        state.prefix,
        { ...failureOf(outcome), ...(reconnected && TOKEN_CODES.includes(outcome.code) ? { context: "reconnected" } : {}) },
        "auth",
        Infinity,
        (await sessionId()) ?? undefined,
      );
      return STOP;
    case "network":
      await setError(state.prefix, { ...failureOf(outcome), context: "retry" }, "network", NETWORK_RETRY_MS);
      return continueIn(NETWORK_RETRY_MS);
  }
}

/**
 * Demande à X l'état de blocage d'un paquet de comptes, ou décide de la suite
 * si la demande échoue : une limite, une session ou un réseau en cause valent
 * pour tout le traitement. Un autre refus renvoie `failed`, à traiter par l'appelant.
 */
async function lookup(state: State, batch: string[]): Promise<Lookup | Next | { failed: Failure }> {
  if (!(await clearedToSend(state, "lookup"))) return continueIn();
  const reply = await lookupBlocking(batch);
  if (!("kind" in reply)) {
    reconnected = false;
    if (reply.quotaEnd !== undefined) await write("holdLookups", reply.quotaEnd, state.account);
    return reply;
  }
  if (isGlobal(reply)) return handleGlobal(state, reply);
  return { failed: failureOf(reply) };
}

/**
 * Vérifie un paquet de comptes de la liste pour un compte X encore jamais
 * vérifié, voir State.audit. Lecture seule : rien n'est modifié côté X. Un
 * paquet refusé est abandonné sans rien changer : la vérification n'est
 * qu'une remise à niveau, elle ne doit pas arrêter le blocage.
 */
async function audit(state: State, batch: string[]): Promise<Next> {
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
const plan = (state: State): Action => nextAction(state, { now: Date.now(), checked });

/** Vérifie un paquet de comptes à bloquer : déjà bloqués, ou introuvables. */
async function check(state: State, batch: string[]): Promise<Next> {
  const reply = await lookup(state, batch);
  if ("stop" in reply) return reply;
  if ("failed" in reply) {
    // Sans vérification, on risquerait de rebloquer : on s'arrête, voir halted.
    await setError(state.prefix, { ...reply.failed, context: "check" }, "other", Infinity);
    return STOP;
  }
  const at = Date.now();
  // Sans prototype : « __proto__ » est un identifiant X valide.
  const entries: Results = Object.create(null);
  for (const handle of batch) {
    if (reply.blocking.has(handle)) entries[handle] = { state: "already_blocked", at };
    else if (!reply.found.has(handle)) {
      entries[handle] = { state: "not_found", at, code: "lookup_missing" };
    } else checked.set(handle, at);
  }
  // Le cas courant, comptes trouvés et non bloqués, n'écrit rien.
  const cleared = recovered(state);
  if (Object.keys(entries).length || Object.keys(cleared).length) await write("recordChecks", entries, cleared, state.account);
  if (Object.values(entries).some((entry) => entry.state === "already_blocked")) await updateBadges("syncBadges", state);
  return continueIn();
}

/** Le résultat est enregistré : un badge manqué ne doit pas arrêter le traitement. */
async function updateBadges(name: "recordBlockSuccess" | "syncBadges", state: State): Promise<void> {
  await write(name, state.account).catch((err: unknown) => console.warn("[Barrage]", err));
}

/** L'appel a abouti : une erreur affichée n'est plus d'actualité. */
function recovered(state: State): Cleared {
  return state.error ? { error: true } : {};
}

/** X a répondu sur ce compte : la série de refus s'arrête là. */
function answered(state: State): Cleared {
  return { ...recovered(state), ...(state.failures.length ? { failures: true } : {}) };
}

/** L'action a abouti : seul un blocage ou un déblocage réussi lève le soupçon d'automatisation. */
function succeeded(state: State): Cleared {
  return { ...answered(state), ...(state.strikes ? { strikes: true } : {}) };
}

/** Refus de ce compte : au dernier permis, tout s'arrête sans le lui imputer. */
async function tripped(state: State, handle: string, cause: Failure): Promise<boolean> {
  const failures = [...new Set([...state.failures, handle])];
  await setFailures(state.prefix, failures);
  if (failures.length < MAX_CONSECUTIVE_FAILURES) return false;
  await stopBroken(state, { ...cause, context: { refusals: failures.length } });
  return true;
}

/** Le message brut de X ne va que dans la console, voir Outcome. */
function logRefusal(handle: string, { param, detail }: Extract<Outcome, { kind: "failed" }>): void {
  console.warn("[Barrage] refus de X pour", handle, param, detail);
}

/** Une vérification de route disparue compte dans le budget, voir api.ts. */
const countLookup = (state: State) => (): Promise<void> => write("recordRequest", "lookup", state.account);

async function block(state: State, handle: string): Promise<Next> {
  if (!(await clearedToSend(state, "action"))) return continueIn();
  const outcome = await blockUser(handle, countLookup(state));
  if (isGlobal(outcome)) return handleGlobal(state, outcome);

  reconnected = false;
  const at = Date.now();
  if (outcome.kind === "ok") {
    await setResults(state.prefix, { [handle]: { state: "blocked", at } }, clearedValues(succeeded(state)));
    await updateBadges("recordBlockSuccess", state);
  } else if (outcome.kind === "not_found") {
    const result: Result = { state: "not_found", at, ...failureOf(outcome) };
    await setResults(state.prefix, { [handle]: result }, clearedValues(answered(state)));
  } else {
    logRefusal(handle, outcome);
    if (await tripped(state, handle, failureOf(outcome))) return STOP;
    await write("recordBlockFailure", handle, failureOf(outcome), at, state.account);
  }
  // Le délai entre deux blocages ne se raccourcit pas quand la liste change.
  return continueIn(jittered(BLOCK_DELAY_MS));
}

/** Débloque un compte désactivé par l'utilisateur après que Barrage l'a bloqué. */
async function unblock(state: State, handle: string): Promise<Next> {
  if (!(await clearedToSend(state, "action"))) return continueIn();
  const outcome = await unblockUser(handle, countLookup(state));
  if (isGlobal(outcome)) return handleGlobal(state, outcome);

  reconnected = false;
  const at = Date.now();
  if (outcome.kind === "failed") {
    logRefusal(handle, outcome);
    if (await tripped(state, handle, failureOf(outcome))) return STOP;
    await write("refuseUnblock", handle, failureOf(outcome), state.account);
  } else {
    const result: Result =
      outcome.kind === "ok" ? { state: "unblocked", at } : { state: "not_found", at, ...failureOf(outcome) };
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
      // Par tranches : l'échéance reste dans le stockage, et un déblocage demandé
      // entre-temps n'attend pas un budget de lookup qui ne le concerne pas.
      return continueIn(Math.min(action.ms, SLEEP_SLICE_MS));
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
async function authResume(error: BlockingError, pageLoad: boolean): Promise<"renewed" | "elapsed" | null> {
  if (!pageLoad) return null;
  const session = await sessionId();
  if (!session) return null;
  if (error.session !== undefined && error.session !== session) return "renewed";
  return Date.now() - (error.at ?? 0) >= AUTH_RETRY_MS ? "elapsed" : null;
}

async function start(pageLoad = false): Promise<void> {
  dirty = true;
  if (running) return;
  const account = accountId();
  if (!account) return;
  await ensureAccount(account);
  let state = await getState(account);
  if (state.error?.reason === "auth") {
    const resume = await authResume(state.error, pageLoad);
    if (!resume) return;
    reconnected = resume === "renewed";
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

/** Démarrage à refaire après un échec, un seul à la fois. */
let retry: { pageLoad: boolean } | null = null;

/**
 * Démarre sans laisser d'échec sans suite : le service worker peut ne pas
 * répondre au chargement, et le traitement ne repartirait qu'à la prochaine
 * modification de l'état. Ce démarrage n'envoie rien à X par lui-même.
 */
function launch(pageLoad = false): void {
  start(pageLoad).catch((err: unknown) => {
    if (!contextAlive()) return;
    console.error("[Barrage]", err);
    if (retry) {
      retry.pageLoad ||= pageLoad;
      return;
    }
    const next = { pageLoad };
    retry = next;
    setTimeout(() => {
      retry = null;
      launch(next.pageLoad);
    }, NETWORK_RETRY_MS);
  });
}

/** Traite la file maintenant, puis à chaque modification qui la concerne. */
export function startRunner(): void {
  onStateChange(coalesced(() => launch()), QUEUE_KEYS);
  launch(true);
}
