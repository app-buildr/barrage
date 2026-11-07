import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
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
} from "../src/core/config.ts";
import { getState, resultKey, type BlockingError, type State } from "../src/core/state.ts";
import { actionDelay, actionsCapped, automationPause, halted, lookupDelay, nextAction, resumable } from "../src/features/blocking/plan.ts";
import {
  recordAutomation,
  refuseUnblock,
  resumeBlocking,
  setError,
} from "../src/features/blocking/store.ts";
import type { UnblockRefusal } from "../src/features/blocking/queue.ts";
import { accountLines } from "../src/features/accounts/lines.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { installChrome } from "./helpers/chrome.ts";

const NOW = 1_000_000_000;
const PERMANENT = Number.MAX_SAFE_INTEGER;

let store: Record<string, unknown>;
const context = (checked: Record<string, number> = {}) => ({ now: NOW, checked: new Map(Object.entries(checked)) });
const fresh = { a: NOW, b: NOW };
const error = (reason: BlockingError["reason"], staleAt = PERMANENT, at = NOW): BlockingError => ({
  message: "m",
  reason,
  staleAt,
  at,
});

beforeEach(() => {
  store = { remote: ["a", "b"], lists: [officialList(true)], onboarded: true };
  installChrome(() => store);
});

const plan = async (overrides: Partial<State> = {}, checked = {}) =>
  nextAction({ ...(await getState()), ...overrides }, context(checked));

const refusal = (state: State, handle: string) => state.results[handle] as UnblockRefusal;

const MIN_GAP = BLOCK_DELAY_MS * (1 - DELAY_JITTER);
/** `count` requêtes régulièrement réparties sur la fin de la fenêtre. */
const times = (count: number, windowMs: number) =>
  Array.from({ length: count }, (_, i) => NOW - windowMs + 1000 * (i + 1));

test("sans travail, rien : ni requête ni attente, même pendant une pause", async () => {
  assert.deepEqual(await plan(), { kind: "stop" });
  assert.deepEqual(await plan({ pauseUntil: NOW + 1000 }), { kind: "stop" });
});

test("un compte vu est vérifié, puis bloqué", async () => {
  assert.deepEqual(await plan({ seen: ["a"] }), { kind: "check", batch: ["a"] });
  assert.deepEqual(await plan({ seen: ["a"] }, fresh), { kind: "block", handle: "a" });
  assert.deepEqual(await plan({ seen: ["a"] }, { a: NOW - CHECK_MAX_AGE_MS }), { kind: "check", batch: ["a"] });
});

test("une pause retient tout travail jusqu'à son échéance", async () => {
  assert.deepEqual(await plan({ seen: ["a"], pauseUntil: NOW + 1000 }, fresh), { kind: "wait", ms: 1000 });
  assert.deepEqual(await plan({ seen: ["a"], pauseUntil: NOW }, fresh), { kind: "block", handle: "a" });
});

test("une vérification de compte X passe avant les déblocages et blocages, sauf entre deux paquets", async () => {
  const audit = Array.from({ length: LOOKUP_BATCH + 1 }, (_, i) => `c${i}`);
  assert.deepEqual(await plan({ seen: ["a"], audit }, fresh), { kind: "audit", batch: audit.slice(0, LOOKUP_BATCH) });
  const lookups = [NOW + 5 - AUDIT_INTERVAL_MS];
  assert.deepEqual(await plan({ seen: ["a"], audit, lookups }, fresh), { kind: "block", handle: "a" });
  assert.deepEqual(await plan({ audit, lookups }), { kind: "wait", ms: 5 });
});

test("une vérification avant blocage passe avant celle du compte X, qui suit dès que possible", async () => {
  const audit = ["c"];
  assert.deepEqual(await plan({ seen: ["a"], audit }), { kind: "check", batch: ["a"] });
  assert.deepEqual(await plan({ seen: ["a"], audit }, fresh), { kind: "audit", batch: audit });
});

test("le délai entre deux actions survit à l'onglet : seule la date stockée compte", async () => {
  const actions = [NOW - 1000];
  assert.deepEqual(await plan({ seen: ["a"], actions }, fresh), { kind: "wait", ms: MIN_GAP - 1000 });
  assert.deepEqual(await plan({ disabled: ["b"], unblock: ["b"], actions }), { kind: "wait", ms: MIN_GAP - 1000 });
  assert.deepEqual(await plan({ seen: ["a"], actions: [NOW - MIN_GAP] }, fresh), { kind: "block", handle: "a" });
});

test("le plafond horaire retient blocages et déblocages jusqu'à ce qu'une action sorte de la fenêtre", async () => {
  const actions = times(MAX_ACTIONS_PER_HOUR, ACTIONS_WINDOW_MS);
  assert.equal(actionDelay(actions, NOW), 1000);
  assert.deepEqual(await plan({ seen: ["a"], actions }, fresh), { kind: "wait", ms: 1000 });
  assert.deepEqual(await plan({ disabled: ["b"], unblock: ["b"], actions }), { kind: "wait", ms: 1000 });
  assert.equal(actionDelay(actions.slice(1), NOW), 0);
  assert.equal(actionsCapped(actions, NOW), false);
  assert.equal(actionsCapped(actions.map((at) => at + 1_000_000), NOW), true);
});

test("une action sortie de la fenêtre ne compte plus", () => {
  const old = Array.from({ length: MAX_ACTIONS_PER_HOUR }, () => NOW - ACTIONS_WINDOW_MS);
  assert.equal(actionDelay(old, NOW), 0);
});

test("plafond atteint, aucune vérification avant blocage : elle serait périmée avant de servir", async () => {
  const actions = times(MAX_ACTIONS_PER_HOUR, ACTIONS_WINDOW_MS).map((at) => at + 60_000);
  assert.deepEqual(await plan({ seen: ["a"], actions }), { kind: "wait", ms: 61_000 });
  // La vérification du compte X, elle, n'attend pas les actions.
  assert.deepEqual(await plan({ seen: ["a"], actions, audit: ["c"] }), { kind: "audit", batch: ["c"] });
});

test("budget de lookup épuisé : ni vérification avant blocage ni vérification de compte", async () => {
  const lookups = times(LOOKUP_BUDGET, LOOKUP_WINDOW_MS);
  assert.deepEqual(await plan({ seen: ["a"], lookups }), { kind: "wait", ms: 1000 });
  assert.deepEqual(await plan({ audit: ["a"], lookups: lookups.map((at) => at + 500_000) }), {
    kind: "wait",
    ms: 501_000,
  });
  assert.equal(lookupDelay({ lookups: lookups.slice(1), lookupPauseUntil: 0 }, NOW), 0);
});

test("budget épuisé, les comptes déjà vérifiés et les déblocages continuent", async () => {
  const lookups = times(LOOKUP_BUDGET, LOOKUP_WINDOW_MS);
  assert.deepEqual(await plan({ seen: ["a"], lookups }, fresh), { kind: "block", handle: "a" });
  assert.deepEqual(await plan({ disabled: ["b"], unblock: ["b"], lookups }), { kind: "unblock", handle: "b" });
});

test("un quota épuisé d'après X retient les lookups seuls, jusqu'à son échéance", async () => {
  const lookupPauseUntil = NOW + 5000;
  assert.deepEqual(await plan({ seen: ["a"], lookupPauseUntil }), { kind: "wait", ms: 5000 });
  assert.deepEqual(await plan({ audit: ["a"], lookupPauseUntil }), { kind: "wait", ms: 5000 });
  assert.deepEqual(await plan({ seen: ["a"], lookupPauseUntil }, fresh), { kind: "block", handle: "a" });
});

test("un déblocage passe avant un blocage", async () => {
  assert.deepEqual(await plan({ seen: ["a"], disabled: ["b"], unblock: ["b"] }, fresh), { kind: "unblock", handle: "b" });
});

test("un compte retiré n'entre pas dans le plan avant la fin du délai de grâce", async () => {
  store[resultKey("z")] = { state: "blocked", at: 1 };
  assert.deepEqual(await plan({ retired: ["z"], retiredAt: { z: NOW } }), { kind: "stop" });
  assert.deepEqual(await plan({ retired: ["z"], retiredAt: { z: 1 } }), { kind: "unblock", handle: "z" });
});

test("une erreur d'arrêt interdit toute requête, travail en file ou non", async () => {
  for (const reason of ["auth", "automation", "api"] as const) {
    assert.deepEqual(await plan({ seen: ["a"], error: error(reason) }, fresh), { kind: "stop" });
    assert.deepEqual(await plan({ audit: ["a"], error: error(reason) }), { kind: "stop" });
    assert.deepEqual(await plan({ disabled: ["b"], unblock: ["b"], error: error(reason) }), { kind: "stop" });
  }
});

test("tant que la liste collaborative n'est pas là, rien ne part : un compte y paraîtrait sorti", async () => {
  store[resultKey("z")] = { state: "blocked", at: 1 };
  const unknown = { remote: null, official: [] };
  assert.deepEqual(await plan({ ...unknown, retired: ["z"], retiredAt: { z: 1 } }), { kind: "stop" });
  assert.deepEqual(await plan({ ...unknown, unblock: ["z"] }), { kind: "stop" });
  assert.deepEqual(await plan({ ...unknown, official: ["a"], retired: ["z"], retiredAt: { z: 1 } }), { kind: "unblock", handle: "z" });
});

test("une raison inconnue arrête par prudence", () => {
  assert.equal(halted({ ...error("other"), reason: "nouvelle" as never }, NOW), true);
});

test("une panne passagère ou une erreur affichée brièvement n'arrête pas", () => {
  assert.equal(halted(null, NOW), false);
  assert.equal(halted(error("network", NOW + 1000), NOW), false);
  assert.equal(halted(error("other", NOW + 1000), NOW), false);
});

test("un échec de vérification ne se retente qu'après son délai, même sans date", () => {
  assert.equal(halted(error("other", PERMANENT, NOW - CHECK_RETRY_MS + 1), NOW), true);
  assert.equal(halted(error("other", PERMANENT, NOW - CHECK_RETRY_MS), NOW), false);
  const { at: _at, ...legacy } = error("other");
  assert.equal(halted(legacy, NOW), false);
});

test("la pause d'automatisation double à chaque rechute et plafonne", () => {
  assert.equal(automationPause(0), AUTOMATION_PAUSE_MS);
  assert.equal(automationPause(1), 2 * AUTOMATION_PAUSE_MS);
  assert.equal(automationPause(3), 8 * AUTOMATION_PAUSE_MS);
  assert.equal(automationPause(5), MAX_PAUSE_MS);
  assert.equal(automationPause(500), MAX_PAUSE_MS);
});

test("un soupçon d'automatisation écrit le compteur, la pause et l'erreur, sous le préfixe du compte", async () => {
  const before = Date.now();
  await recordAutomation("acct:2/", 2, { code: "automation" });
  const pauseUntil = store["acct:2/pauseUntil"] as number;
  assert.equal(store["acct:2/strikes"], 3);
  assert.ok(pauseUntil >= before + 4 * AUTOMATION_PAUSE_MS);
  assert.equal((store["acct:2/error"] as BlockingError).reason, "automation");
  assert.equal(store.strikes, undefined);
});

test("la reprise attend la fin de la pause, puis lève l'arrêt sans oublier le soupçon", async () => {
  await recordAutomation("", 0, { code: "automation" });
  await resumeBlocking();
  assert.equal((await getState()).error?.reason, "automation");
  store.pauseUntil = Date.now() - 1;
  store.failures = ["a"];
  await resumeBlocking();
  const state = await getState();
  assert.equal(state.error, null);
  assert.equal(state.strikes, 1);
  assert.deepEqual(state.failures, []);
});

test("une erreur de session ne se lève pas depuis les options", async () => {
  await setError("", { code: "session_expired" }, "auth", Infinity);
  await resumeBlocking();
  assert.equal((await getState()).error?.reason, "auth");
  assert.equal(resumable(error("auth")), false);
  assert.equal(resumable(error("api")), true);
});

test("un compte retiré dont le déblocage est refusé reste en file pour trois tentatives", async () => {
  store.retired = ["z"];
  store.retiredAt = { z: 1 };
  store[resultKey("z")] = { state: "blocked", at: 1 };
  for (const attempts of [1, 2]) {
    await refuseUnblock("z", { code: "refused", param: 1 });
    const state = await getState();
    assert.deepEqual(state.retired, ["z"]);
    assert.equal(refusal(state, "z").unblockAttempts, attempts);
    assert.equal(refusal(state, "z").unblockFailed, undefined);
  }
  await refuseUnblock("z", { code: "refused", param: 1 });
  const state = await getState();
  assert.deepEqual(state.retired, []);
  assert.equal(refusal(state, "z").unblockFailed, true);
});

test("un compte sur Off dont le déblocage est refusé sort de la file aussitôt", async () => {
  store.disabled = ["a"];
  store.unblock = ["a"];
  store[resultKey("a")] = { state: "blocked", at: 1 };
  await refuseUnblock("a", { code: "refused", param: 1 });
  const state = await getState();
  assert.deepEqual(state.unblock, []);
  assert.equal(refusal(state, "a").unblockFailed, true);
});

test("pendant une pause ou un arrêt, les comptes en file sont en attente", async () => {
  store.seen = ["a"];
  const label = async (extra: Record<string, unknown>) => {
    Object.assign(store, extra);
    return accountLines(await getState())[0]?.status.label;
  };
  assert.equal(await label({}), "Blocage en cours…");
  assert.equal(await label({ pauseUntil: Date.now() + 60_000 }), "En attente");
  assert.equal(await label({ pauseUntil: 0, error: error("automation", PERMANENT, Date.now()) }), "En attente");
});
