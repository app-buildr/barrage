import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { AUTOMATION_PAUSE_MS, CHECK_MAX_AGE_MS, CHECK_RETRY_MS, LOOKUP_BATCH, MAX_PAUSE_MS } from "../src/core/config.ts";
import { getState, resultKey, type BlockingError, type State } from "../src/core/state.ts";
import { automationPause, halted, nextAction, resumable } from "../src/features/blocking/plan.ts";
import {
  recordAutomation,
  refuseUnblock,
  resumeBlocking,
  setError,
} from "../src/features/blocking/store.ts";
import { accountLines } from "../src/features/accounts/lines.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { installChrome } from "./helpers/chrome.ts";

const NOW = 1_000_000_000;
const PERMANENT = Number.MAX_SAFE_INTEGER;

let store: Record<string, unknown>;
const context = (checked: Record<string, number> = {}, nextAuditAt = 0) => ({
  now: NOW,
  checked: new Map(Object.entries(checked)),
  nextAuditAt,
});
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

const plan = async (overrides: Partial<State> = {}, checked = {}, nextAuditAt = 0) =>
  nextAction({ ...(await getState()), ...overrides }, context(checked, nextAuditAt));

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
  assert.deepEqual(await plan({ seen: ["a"], audit }, fresh, NOW + 5), { kind: "block", handle: "a" });
  assert.deepEqual(await plan({ audit }, {}, NOW + 5), { kind: "wait", ms: 5 });
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
  await recordAutomation("acct:2/", 2, "soupçon");
  const pauseUntil = store["acct:2/pauseUntil"] as number;
  assert.equal(store["acct:2/strikes"], 3);
  assert.ok(pauseUntil >= before + 4 * AUTOMATION_PAUSE_MS);
  assert.equal((store["acct:2/error"] as BlockingError).reason, "automation");
  assert.equal(store.strikes, undefined);
});

test("la reprise attend la fin de la pause, puis lève l'arrêt sans oublier le soupçon", async () => {
  await recordAutomation("", 0, "soupçon");
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
  await setError("", "session", "auth", Infinity);
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
    await refuseUnblock("z", "non");
    const state = await getState();
    assert.deepEqual(state.retired, ["z"]);
    assert.equal(state.results.z?.unblockAttempts, attempts);
    assert.equal(state.results.z?.unblockFailed, undefined);
  }
  await refuseUnblock("z", "non");
  const state = await getState();
  assert.deepEqual(state.retired, []);
  assert.equal(state.results.z?.unblockFailed, true);
});

test("un compte sur Off dont le déblocage est refusé sort de la file aussitôt", async () => {
  store.disabled = ["a"];
  store.unblock = ["a"];
  store[resultKey("a")] = { state: "blocked", at: 1 };
  await refuseUnblock("a", "non");
  const state = await getState();
  assert.deepEqual(state.unblock, []);
  assert.equal(state.results.a?.unblockFailed, true);
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
