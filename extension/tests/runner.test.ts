import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import {
  AUTH_RETRY_MS,
  AUTOMATION_PAUSE_MS,
  CHECK_RETRY_MS,
  DELAY_JITTER,
  DELAY_SECONDS,
  MAX_PAUSE_MS,
  NETWORK_RETRY_MS,
  RETIRE_GRACE_MS,
} from "../src/core/config.ts";
import { getState, resultKey } from "../src/core/state.ts";
import { write } from "../src/core/write.ts";
import { serveWrites } from "../src/core/writer.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { installChrome } from "./helpers/chrome.ts";
import { apiError, BLOCK, installX, LOOKUP, lookupReply, UNBLOCK, type FakeX } from "./helpers/x.ts";

const T0 = Date.UTC(2026, 10, 7);
const realSetTimeout = globalThis.setTimeout;

let store: Record<string, unknown>;
let x: FakeX;
let tabs = 0;

/**
 * Laisse finir ce qui n'attend pas le temps : promesses, empreinte de session,
 * et les attentes nulles du traitement entre deux actions.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => realSetTimeout(resolve, 2));
    mock.timers.tick(0);
  }
}

/** Fait avancer l'horloge, par pas : chaque réveil peut armer le minuteur suivant. */
async function advance(ms: number, stepMs = 1000): Promise<void> {
  for (let done = 0; done < ms; done += stepMs) {
    mock.timers.tick(Math.min(stepMs, ms - done));
    await settle();
  }
}

/** Un chargement de x.com : le module neuf n'a ni état d'onglet ni minuteur. */
async function openTab(): Promise<void> {
  const { startRunner } = await import(`../src/features/blocking/runner.ts?tab=${++tabs}`);
  startRunner();
  await settle();
}

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
  store = {
    remote: ["a", "b", "c", "d", "e"],
    lists: [officialList(true)],
    onboarded: true,
    account: "1",
    legacy: "1",
    accounts: { "1": {} },
  };
  installChrome(() => store);
  serveWrites();
  x = installX();
});

afterEach(() => {
  mock.timers.reset();
});

test("un compte en file est vérifié puis bloqué, et le résultat écrit", async () => {
  store.seen = ["a"];
  await openTab();
  assert.deepEqual(x.requests.map((r) => r.path), [LOOKUP, BLOCK]);
  const state = await getState("1");
  assert.equal(state.results.a?.state, "blocked");
  assert.equal(state.blockCount, 1);
});

test("sans travail, aucune requête", async () => {
  await openTab();
  assert.equal(x.requests.length, 0);
});

test("un compte que X dit déjà bloqué n'est pas rebloqué ni attribué à Barrage", async () => {
  store.seen = ["a"];
  x.routes[LOOKUP] = () => lookupReply(["a"], ["a"]);
  await openTab();
  assert.deepEqual(x.posts(BLOCK), []);
  assert.equal((await getState("1")).results.a?.state, "already_blocked");
});

test("un lookup refusé arrête tout, sans blocage, et ne se relance qu'après son délai", async () => {
  store.seen = ["a"];
  x.routes[LOOKUP] = () => apiError(999);
  await openTab();
  assert.equal(x.requests.length, 1);
  assert.deepEqual(x.posts(BLOCK), []);
  const state = await getState("1");
  assert.equal(state.error?.reason, "other");
  assert.equal(state.results.a, undefined);

  // Un compte vu de plus ne relance pas de lookup.
  await write("addSeen", ["b"], "1");
  await settle();
  assert.equal(x.requests.length, 1);

  await advance(CHECK_RETRY_MS, 60_000);
  await write("addSeen", ["c"], "1");
  await settle();
  assert.equal(x.requests.length, 2);
});

test("une limite de X est respectée jusqu'à son échéance, y compris par un autre onglet", async () => {
  store.seen = ["a"];
  const reset = Math.floor(T0 / 1000) + 600;
  x.routes[BLOCK] = () => ({ status: 429, text: "", headers: { "x-rate-limit-reset": String(reset) } });
  await openTab();
  assert.deepEqual(x.posts(BLOCK), ["a"]);
  const { pauseUntil } = await getState("1");
  assert.ok(pauseUntil >= reset * 1000);
  assert.ok(pauseUntil <= reset * 1000 + DELAY_SECONDS * 1000 * (1 + DELAY_JITTER));

  x.routes[BLOCK] = () => ({ json: {} });
  await openTab();
  await advance(599_000, 60_000);
  assert.deepEqual(x.posts(BLOCK), ["a"]);
  await advance(30_000);
  assert.deepEqual(x.posts(BLOCK), ["a", "a"]);
  assert.equal((await getState("1")).results.a?.state, "blocked");
});

test("une échéance de limite absurde est ramenée à la pause maximale", async () => {
  store.seen = ["a"];
  x.routes[BLOCK] = () => ({ status: 429, text: "", headers: { "x-rate-limit-reset": "99999999999" } });
  await openTab();
  const { pauseUntil } = await getState("1");
  assert.ok(pauseUntil <= T0 + MAX_PAUSE_MS + 2 * DELAY_SECONDS * 1000);
});

test("le code 226 arrête tout, même une fois la pause finie, jusqu'à la reprise demandée", async () => {
  store.seen = ["a", "b"];
  x.routes[BLOCK] = () => apiError(226);
  await openTab();
  await openTab();
  assert.deepEqual(x.posts(BLOCK), ["a"]);
  const state = await getState("1");
  assert.equal(state.strikes, 1);
  assert.equal(state.error?.reason, "automation");
  assert.equal(state.pauseUntil, T0 + AUTOMATION_PAUSE_MS);

  const requests = x.requests.length;
  await advance(AUTOMATION_PAUSE_MS + 1000, 600_000);
  await openTab();
  await write("addSeen", ["c"], "1");
  await settle();
  assert.equal(x.requests.length, requests);

  // Rechute après la reprise : pause doublée, le compteur a survécu.
  await write("resumeBlocking");
  await settle();
  assert.deepEqual(x.posts(BLOCK), ["a", "a"]);
  const relapse = await getState("1");
  assert.equal(relapse.strikes, 2);
  assert.equal(relapse.pauseUntil - Date.now(), 2 * AUTOMATION_PAUSE_MS);
});

test("le premier blocage réussi remet le compteur de soupçons à zéro", async () => {
  store.seen = ["a"];
  store.strikes = 3;
  await openTab();
  assert.equal((await getState("1")).strikes, 0);
});

test("une vérification réussie ne suffit pas à lever le soupçon", async () => {
  store.seen = ["a"];
  store.strikes = 3;
  x.routes[LOOKUP] = () => lookupReply(["a"], ["a"]);
  await openTab();
  assert.equal((await getState("1")).strikes, 3);
});

test("une erreur de session arrête la file, et un autre onglet n'envoie rien", async () => {
  store.seen = ["a", "b", "c"];
  x.routes[BLOCK] = () => apiError(326);
  await Promise.all([openTab(), openTab()]);
  await settle();
  assert.deepEqual(x.posts(BLOCK), ["a"]);
  assert.equal((await getState("1")).error?.reason, "auth");
});

test("un 401 ne reprend qu'au chargement d'une nouvelle session ou après le délai", async () => {
  store.seen = ["a"];
  x.routes[BLOCK] = () => ({ status: 401, text: "" });
  await openTab();
  assert.equal(x.posts(BLOCK).length, 1);
  x.routes[BLOCK] = () => ({ json: {} });

  // Nouveau compte vu, puis rechargement avant le délai : rien.
  await write("addSeen", ["b"], "1");
  await settle();
  await advance(AUTH_RETRY_MS - 60_000, 600_000);
  await openTab();
  assert.equal(x.posts(BLOCK).length, 1);

  // Nouveau jeton : reconnexion.
  x.cookies.ct0 = "autre";
  await write("addSeen", ["c"], "1");
  await settle();
  assert.equal(x.posts(BLOCK).length, 1);
  await openTab();
  assert.ok(x.posts(BLOCK).length > 1);
  assert.equal((await getState("1")).error, null);
});

test("passé le délai, un chargement retente avec la même session", async () => {
  store.seen = ["a"];
  x.routes[BLOCK] = () => apiError(326);
  await openTab();
  x.routes[BLOCK] = () => ({ json: {} });
  await advance(AUTH_RETRY_MS, 600_000);
  await openTab();
  assert.deepEqual(x.posts(BLOCK), ["a", "a"]);
});

test("un changement de compte juste avant l'envoi annule l'envoi, et rien n'est écrit pour l'ancien compte", async () => {
  store.seen = ["a"];
  const get = chrome.storage.local.get;
  let reads: number | null = null;
  x.routes[LOOKUP] = (request) => {
    reads = 0;
    return lookupReply((request.handle ?? "").split(","));
  };
  (chrome.storage.local as any).get = async (query: any) => {
    const stored = await (get as any)(query);
    // Après le lookup : lecture par syncBadges, puis lecture de l'état par le
    // tour suivant. La session change juste après celle-ci, avant le POST.
    if (reads !== null && query === null && ++reads === 2) x.cookies.twid = "u%3D2";
    return stored;
  };
  await openTab();
  assert.ok((reads ?? 0) >= 2);
  assert.deepEqual(x.posts(BLOCK), []);
  assert.equal((await getState("1")).results.a, undefined);
  assert.equal((await getState("2")).results.a, undefined);
});

test("deux blocages restent espacés, même si la liste change pendant l'attente", async () => {
  store.seen = ["a", "b", "c", "d", "e"];
  const times: number[] = [];
  x.routes[BLOCK] = () => {
    times.push(Date.now());
    return { json: {} };
  };
  await openTab();
  for (let i = 0; i < 12; i++) {
    await advance(5000);
    await chrome.storage.local.set({ disabled: [`z${i}`] });
    await settle();
  }
  assert.equal(times.length, 5);
  const minimum = DELAY_SECONDS * 1000 * (1 - DELAY_JITTER);
  for (let i = 1; i < times.length; i++) {
    assert.ok((times[i] as number) - (times[i - 1] as number) >= minimum, `écart ${i}`);
  }
});

test("un refus sans code connu arrête tout dès le premier, sans rien imputer au compte", async () => {
  store.seen = ["a", "b", "c"];
  x.routes[BLOCK] = () => ({ status: 403, text: "" });
  await openTab();
  await advance(60_000);
  assert.deepEqual(x.posts(BLOCK), ["a"]);
  const state = await getState("1");
  assert.equal(state.error?.reason, "api");
  assert.equal(state.results.a, undefined);
  assert.deepEqual(state.seen, ["a", "b", "c"]);
});

test("trois comptes refusés de suite déclenchent le disjoncteur, sans toucher au dernier", async () => {
  store.seen = ["a", "b", "c", "d"];
  x.routes[BLOCK] = () => apiError(999);
  await openTab();
  await advance(120_000);
  const posts = x.posts(BLOCK);
  // Trois tentatives sur a, trois sur b, une sur c : d n'est jamais visé.
  assert.deepEqual(posts, ["a", "a", "a", "b", "b", "b", "c"]);
  const state = await getState("1");
  assert.equal(state.error?.reason, "api");
  assert.equal(state.results.c, undefined);
  assert.deepEqual(state.failures, ["a", "b", "c"]);

  // La reprise dans les options relance, série remise à zéro.
  x.routes[BLOCK] = () => ({ json: {} });
  await write("resumeBlocking");
  await settle();
  assert.deepEqual((await getState("1")).failures, []);
  assert.equal((await getState("1")).results.c?.state, "blocked");
});

test("un blocage réussi interrompt la série de refus", async () => {
  store.seen = ["a"];
  store.failures = ["x", "y"];
  await openTab();
  assert.deepEqual((await getState("1")).failures, []);
});

test("une panne réseau attend et retente, sans compter d'échec", async () => {
  store.seen = ["a"];
  x.routes[LOOKUP] = () => "offline";
  await openTab();
  assert.equal((await getState("1")).error?.reason, "network");
  assert.equal(x.requests.length, 1);
  x.routes[LOOKUP] = (request) => lookupReply((request.handle ?? "").split(","));
  await advance(NETWORK_RETRY_MS);
  assert.equal((await getState("1")).results.a?.state, "blocked");
  assert.equal((await getState("1")).error, null);
});

test("un code 34 sur un déblocage n'est pas noté fait si le compte existe", async () => {
  store.disabled = ["a"];
  store[resultKey("a")] = { state: "blocked", at: 1 };
  x.routes[UNBLOCK] = () => apiError(34, 404);
  await openTab();
  const state = await getState("1");
  assert.equal(state.error?.reason, "api");
  assert.equal(state.results.a?.state, "blocked");
});

test("un compte retiré n'est débloqué qu'après le délai de grâce", async () => {
  store.retired = ["z"];
  store.retiredAt = { z: T0 };
  store[resultKey("z")] = { state: "blocked", at: 1 };
  await openTab();
  assert.equal(x.requests.length, 0);
  await advance(RETIRE_GRACE_MS, 6 * 3600_000);
  await openTab();
  assert.deepEqual(x.posts(UNBLOCK), ["z"]);
  assert.equal((await getState("1")).results.z?.state, "unblocked");
});

test("l'onglet qui attend le verrou reprend la file, sans doubler les requêtes", async () => {
  store.seen = ["a", "b"];
  await Promise.all([openTab(), openTab()]);
  await advance(20_000);
  assert.deepEqual(x.posts(BLOCK), ["a", "b"]);
});

test("la vérification d'un compte X passe par paquets, sans rien bloquer", async () => {
  store.audit = ["a", "b"];
  x.routes[LOOKUP] = () => lookupReply(["a", "b"], ["a"]);
  await openTab();
  const state = await getState("1");
  assert.deepEqual(x.posts(BLOCK), []);
  assert.deepEqual(state.audit, []);
  assert.equal(state.results.a?.state, "already_blocked");
});
