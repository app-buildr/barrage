import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import {
  ACTIONS_WINDOW_MS,
  AUDIT_INTERVAL_MS,
  AUTH_RETRY_MS,
  AUTOMATION_PAUSE_MS,
  BLOCK_DELAY_MS,
  CHECK_RETRY_MS,
  DELAY_JITTER,
  LOOKUP_BUDGET,
  LOOKUP_WINDOW_MS,
  MAX_ACTIONS_PER_HOUR,
  MAX_PAUSE_MS,
  NETWORK_RETRY_MS,
  SLEEP_SLICE_MS,
  STATE_COALESCE_MS,
} from "../src/core/config.ts";
import { getState, resultKey } from "../src/core/state.ts";
import { write } from "../src/core/write.ts";
import { serveWrites } from "../src/core/writer.ts";
import { WRITES } from "../src/features/writes.ts";
import { resumeBlocking } from "../src/features/blocking/store.ts";
import { profileKey } from "../src/features/profiles/store.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { resolveListUpdate } from "../src/features/lists/store.ts";
import { installChrome, X_TAB } from "./helpers/chrome.ts";
import { putResults, result } from "./helpers/fixtures.ts";
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
  installChrome(() => store, { sender: X_TAB });
  serveWrites(WRITES);
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

const PROFILE_REPLY = {
  json: { screen_name: "A", name: "Compte A", description: "Bio", profile_image_url_https: "https://pbs.twimg.com/profile_images/1/a_normal.jpg" },
};

/** Clés de chaque écriture, dans l'ordre ; `fail` fait échouer celles qui contiennent cette clé. */
function spyWrites(fail?: string): string[][] {
  const writes: string[][] = [];
  const set = chrome.storage.local.set.bind(chrome.storage.local);
  chrome.storage.local.set = ((values: Record<string, unknown>) => {
    writes.push(Object.keys(values));
    return fail && fail in values ? Promise.reject(new Error("quota")) : set(values);
  }) as typeof chrome.storage.local.set;
  return writes;
}

test("le profil renvoyé par X est enregistré à part, juste avant le résultat du blocage", async () => {
  store.seen = ["a"];
  x.routes[BLOCK] = () => PROFILE_REPLY;
  const writes = spyWrites();
  await openTab();
  assert.deepEqual(store[profileKey("a")], {
    name: "Compte A",
    screenName: "A",
    avatar: "https://pbs.twimg.com/profile_images/1/a_normal.jpg",
    bio: "Bio",
    followers: null,
    verified: false,
  });
  const profileAt = writes.findIndex((keys) => keys.includes(profileKey("a")));
  const resultAt = writes.findIndex((keys) => keys.includes(resultKey("a")));
  assert.ok(profileAt >= 0 && profileAt < resultAt);
  assert.ok(!writes[resultAt]?.includes(profileKey("a")));
});

test("un profil qui ne s'enregistre pas n'empêche pas d'enregistrer le blocage", async () => {
  store.seen = ["a"];
  x.routes[BLOCK] = () => PROFILE_REPLY;
  spyWrites(profileKey("a"));
  const warn = mock.method(console, "warn", () => {});
  await openTab();
  warn.mock.restore();
  assert.equal((await getState("1")).results.a?.state, "blocked");
  assert.equal(store[profileKey("a")], undefined);
  assert.deepEqual(x.posts(BLOCK), ["a"]);
});

test("une réponse de blocage sans profil lisible bloque quand même, et oublie l'ancien profil", async () => {
  store.seen = ["a"];
  store[profileKey("a")] = { name: "Ancien titulaire", screenName: "A", avatar: null, bio: "" };
  await openTab();
  assert.equal((await getState("1")).results.a?.state, "blocked");
  assert.equal(store[profileKey("a")], undefined);
});

test("un compte débloqué perd son profil", async () => {
  store[resultKey("a")] = { state: "blocked", at: T0 - 1000 };
  store.disabled = ["a"];
  store.unblock = ["a"];
  store[profileKey("a")] = { name: "Compte A", screenName: "A", avatar: null, bio: "" };
  await openTab();
  assert.deepEqual(x.posts(UNBLOCK), ["a"]);
  assert.equal((await getState("1")).results.a?.state, "unblocked");
  assert.equal(store[profileKey("a")], undefined);
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
  await advance(STATE_COALESCE_MS);
  assert.equal(x.requests.length, 1);

  await advance(CHECK_RETRY_MS, 60_000);
  await write("addSeen", ["c"], "1");
  await advance(STATE_COALESCE_MS);
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
  assert.ok(pauseUntil <= reset * 1000 + BLOCK_DELAY_MS * (1 + DELAY_JITTER));

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
  assert.ok(pauseUntil <= T0 + MAX_PAUSE_MS + 2 * BLOCK_DELAY_MS);
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
  await advance(STATE_COALESCE_MS);
  assert.equal(x.requests.length, requests);

  // Rechute après la reprise : pause doublée, le compteur a survécu.
  await resumeBlocking();
  await advance(STATE_COALESCE_MS);
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
  await advance(STATE_COALESCE_MS);
  await advance(AUTH_RETRY_MS - 60_000, 600_000);
  await openTab();
  assert.equal(x.posts(BLOCK).length, 1);

  // Nouveau jeton : reconnexion.
  x.cookies.ct0 = "autre";
  await write("addSeen", ["c"], "1");
  await advance(STATE_COALESCE_MS);
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
    // Après le lookup, lecture de l'état par le tour suivant. La session change
    // juste après celle-ci, avant le POST.
    if (reads !== null && query === null && ++reads === 1) x.cookies.twid = "u%3D2";
    return stored;
  };
  await openTab();
  assert.ok((reads ?? 0) >= 1);
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
  const minimum = BLOCK_DELAY_MS * (1 - DELAY_JITTER);
  for (let i = 1; i < times.length; i++) {
    assert.ok((times[i] as number) - (times[i - 1] as number) >= minimum, `écart ${i}`);
  }
});

test("recharger l'onglet n'annule pas le délai entre deux blocages", async () => {
  store.seen = ["a", "b"];
  await openTab();
  assert.deepEqual(x.posts(BLOCK), ["a"]);
  await openTab();
  assert.deepEqual(x.posts(BLOCK), ["a"]);
  await advance(BLOCK_DELAY_MS * (1 + DELAY_JITTER) + 1000);
  assert.deepEqual(x.posts(BLOCK), ["a", "b"]);
});

test("la requête est notée avant l'envoi, sous les clés du compte X", async () => {
  store["acct:2/seen"] = ["a"];
  store.account = "2";
  store.accounts = { "1": {}, "2": {} };
  x.cookies.twid = "u%3D2";
  let noted: unknown = null;
  x.routes[BLOCK] = () => {
    noted = store["acct:2/actions"];
    return { json: {} };
  };
  await openTab();
  assert.deepEqual(noted, [T0]);
  assert.equal(store.actions, undefined);
});

test("sans réponse du service worker à la note d'avant envoi, rien ne part", async (t) => {
  t.mock.method(console, "error", () => {});
  store.seen = ["a"];
  const sendMessage = chrome.runtime.sendMessage;
  (chrome.runtime as any).sendMessage = async (message: { name: string }) =>
    message.name === "recordRequest" ? undefined : (sendMessage as any)(message);
  await openTab();
  await advance(NETWORK_RETRY_MS * 3, 10_000);
  assert.equal(x.requests.length, 0);
});

test("le plafond horaire retient les blocages, même après un rechargement, puis ils reprennent", async () => {
  store.seen = ["a"];
  store.actions = Array.from({ length: MAX_ACTIONS_PER_HOUR }, (_, i) => T0 - ACTIONS_WINDOW_MS + 60_000 + i);
  await openTab();
  await openTab();
  await advance(50_000, 10_000);
  assert.deepEqual(x.posts(BLOCK), []);
  await advance(20_000, 10_000);
  assert.deepEqual(x.posts(BLOCK), ["a"]);
  assert.ok((store.actions as number[]).length <= MAX_ACTIONS_PER_HOUR);
});

test("le budget de lookup retient les vérifications, y compris d'un autre chargement", async () => {
  store.seen = ["a"];
  store.lookups = Array.from({ length: LOOKUP_BUDGET }, (_, i) => T0 - LOOKUP_WINDOW_MS + 60_000 + i);
  await openTab();
  await advance(50_000, 10_000);
  assert.equal(x.requests.length, 0);
  await advance(20_000, 10_000);
  assert.deepEqual(x.posts(BLOCK), ["a"]);
  assert.equal(x.requests.filter((r) => r.path === LOOKUP).length, 1);
});

test("le budget tient sur un quart d'heure, vérifications de compte et d'avant blocage confondues", async () => {
  const handles = Array.from({ length: 300 }, (_, i) => `c${i}`);
  store.remote = handles;
  store.audit = handles;
  store.seen = handles;
  const stamps: number[] = [];
  x.routes[LOOKUP] = (request) => {
    stamps.push(Date.now());
    return lookupReply((request.handle ?? "").split(","));
  };
  await openTab();
  await advance(2 * LOOKUP_WINDOW_MS, 10_000);
  assert.ok(stamps.length > LOOKUP_BUDGET);
  stamps.slice(LOOKUP_BUDGET).forEach((at, i) => {
    assert.ok(at - (stamps[i] as number) >= LOOKUP_WINDOW_MS, `requête ${i + LOOKUP_BUDGET}`);
  });
});

test("l'intervalle entre deux paquets de vérification survit à l'onglet", async () => {
  store.audit = Array.from({ length: 150 }, (_, i) => `c${i}`);
  await openTab();
  assert.equal(x.requests.length, 1);
  await openTab();
  await advance(AUDIT_INTERVAL_MS - 10_000, 10_000);
  assert.equal(x.requests.length, 1);
  await advance(20_000, 10_000);
  assert.equal(x.requests.length, 2);
});

test("un déblocage demandé pendant l'attente du budget de lookup n'attend pas la fin de celle-ci", async () => {
  store.audit = ["c"];
  store.lookups = Array.from({ length: LOOKUP_BUDGET }, (_, i) => T0 - 60_000 + i);
  store.disabled = [];
  await openTab();
  assert.equal(x.requests.length, 0);
  store.disabled = ["a"];
  store[resultKey("a")] = { state: "blocked", at: 1 };
  await advance(SLEEP_SLICE_MS + 1000, 5000);
  assert.deepEqual(x.posts(UNBLOCK), ["a"]);
  assert.equal(x.requests.length, 1);
});

test("X annonce un quota épuisé : plus de lookup jusqu'à l'échéance, le blocage vérifié part quand même", async () => {
  store.seen = ["a", "b"];
  const reset = Math.floor(T0 / 1000) + 300;
  x.routes[LOOKUP] = (request) => ({
    ...(lookupReply((request.handle ?? "").split(",")) as object),
    headers: { "x-rate-limit-remaining": "0", "x-rate-limit-reset": String(reset) },
  });
  await openTab();
  await advance(BLOCK_DELAY_MS * 3);
  assert.deepEqual(x.posts(BLOCK), ["a", "b"]);
  assert.equal(x.requests.filter((r) => r.path === LOOKUP).length, 1);
  assert.equal((await getState("1")).lookupPauseUntil, reset * 1000);
  assert.equal((await getState("1")).pauseUntil, 0);
});

test("un code 34 sur un déblocage compte sa vérification de route dans le budget", async () => {
  store.disabled = ["a"];
  putResults(store, { a: result("blocked") });
  x.routes[UNBLOCK] = () => apiError(34, 404);
  await openTab();
  assert.deepEqual(store.lookups, [T0]);
});

test("un 401 après une reconnexion le dit : ce n'est plus la session qui est en cause", async () => {
  store.seen = ["a"];
  x.routes[LOOKUP] = () => ({ status: 401, text: "" });
  await openTab();
  assert.equal((await getState("1")).error?.context, undefined);
  x.cookies.ct0 = "autre";
  await openTab();
  const { error } = await getState("1");
  assert.equal(error?.reason, "auth");
  assert.equal(error?.context, "reconnected");
});

test("un 401 après le seul délai, sans reconnexion, reste une session expirée", async () => {
  store.seen = ["a"];
  x.routes[LOOKUP] = () => ({ status: 401, text: "" });
  await openTab();
  await advance(AUTH_RETRY_MS, 600_000);
  await openTab();
  assert.equal((await getState("1")).error?.context, undefined);
});

test("une réponse de X entre la reconnexion et le 401 écarte le jeton web", async () => {
  store.seen = ["a"];
  x.routes[BLOCK] = () => ({ status: 401, text: "" });
  await openTab();
  x.cookies.ct0 = "autre";
  let posts = 0;
  x.routes[BLOCK] = () => (++posts === 1 ? { json: {} } : { status: 401, text: "" });
  store.seen = ["a", "b"];
  await openTab();
  await advance(BLOCK_DELAY_MS * 2);
  assert.equal((await getState("1")).error?.reason, "auth");
  assert.equal((await getState("1")).error?.context, undefined);
});

test("sans service worker, un blocage fait et une limite de X restent notés", async (t) => {
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
  store.seen = ["a", "b"];
  const silence = () => {
    (chrome.runtime as any).sendMessage = async () => undefined;
  };
  x.routes[BLOCK] = (request) => {
    silence();
    return request.handle === "a" ? { json: {} } : { status: 429, text: "" };
  };
  await openTab();
  assert.equal((await getState("1")).results.a?.state, "blocked");

  // La suite part d'un onglet neuf, le service worker répondant de nouveau pour la note d'avant envoi.
  const blocked = store[resultKey("a")];
  installChrome(() => store, { sender: X_TAB });
  serveWrites(WRITES);
  await advance(BLOCK_DELAY_MS * 2);
  await openTab();
  await advance(BLOCK_DELAY_MS * 2);
  assert.deepEqual(store[resultKey("a")], blocked);
  assert.ok(((await getState("1")).pauseUntil) > Date.now());
});

test("avant la copie de la liste intégrée, rien ne part, puis son arrivée relance le traitement", async () => {
  delete store.remote;
  store.unblock = ["a"];
  putResults(store, { a: result("blocked") });
  await openTab();
  assert.equal(x.requests.length, 0);
  await chrome.storage.local.set({ bundled: ["a", "b"] });
  await advance(STATE_COALESCE_MS);
  assert.equal(x.requests.length, 0);
  await chrome.storage.local.set({ bundled: ["b"] });
  await advance(STATE_COALESCE_MS);
  assert.deepEqual(x.posts(UNBLOCK), ["a"]);
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
  await resumeBlocking();
  await advance(STATE_COALESCE_MS);
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
  putResults(store, { a: result("blocked") });
  x.routes[UNBLOCK] = () => apiError(34, 404);
  await openTab();
  const state = await getState("1");
  assert.equal(state.error?.reason, "api");
  assert.equal(state.results.a?.state, "blocked");
});

test("un compte retiré n'est débloqué que sur le choix de l'utilisateur", async () => {
  store.retired = ["z"];
  store.retiredAt = { z: T0 };
  putResults(store, { z: result("blocked") });
  await openTab();
  await advance(7 * 24 * 3600_000, 6 * 3600_000);
  assert.equal(x.requests.length, 0);
  await resolveListUpdate(null, ["z"], [], [], []);
  await advance(STATE_COALESCE_MS);
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

test("une vérification sans rien à noter n'écrit que la requête à venir", async () => {
  store.seen = ["a"];
  const written: string[][] = [];
  const set = chrome.storage.local.set.bind(chrome.storage.local);
  (chrome.storage.local as any).set = (values: Record<string, unknown>) => {
    written.push(Object.keys(values));
    return set(values);
  };
  const sent: string[] = [];
  const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime) as (message: unknown) => Promise<unknown>;
  (chrome.runtime as any).sendMessage = (message: { name: string }) => {
    sent.push(message.name);
    return sendMessage(message);
  };
  x.routes[LOOKUP] = (request) => {
    written.length = 0;
    sent.length = 0;
    return lookupReply((request.handle ?? "").split(","));
  };
  // Relevé ici et vérifié après : une assertion levée dans la route passerait pour une panne réseau.
  let beforePost: unknown = null;
  x.routes[BLOCK] = () => {
    beforePost = { written: [...written], sent: [...sent] };
    return { json: {} };
  };
  await openTab();
  assert.deepEqual(x.posts(BLOCK), ["a"]);
  // Rien pour le compte vérifié : seul le blocage à venir est noté, avant son envoi.
  assert.deepEqual(beforePost, { written: [["actions"]], sent: ["recordRequest"] });
});

test("un compte déjà bloqué met les badges à jour, une vérification réussie lève l'erreur affichée", async () => {
  store.seen = ["a"];
  store.error = { message: "coupure", reason: "network", staleAt: T0 + 1000 };
  x.routes[LOOKUP] = () => lookupReply(["a"], ["a"]);
  await openTab();
  const state = await getState("1");
  assert.equal(state.results.a?.state, "already_blocked");
  assert.equal(state.error, null);
  assert.equal(state.blockCount, 1);
  assert.deepEqual(x.posts(BLOCK), []);
});

test("des comptes X stockés corrompus n'empêchent pas de déclarer la session", async () => {
  store.accounts = null;
  await openTab();
  assert.ok(Object.hasOwn(store.accounts as object, "1"));
});

test("une rafale d'écritures ne relit l'état qu'une fois par onglet", async () => {
  await openTab();
  let reads = 0;
  const get = chrome.storage.local.get.bind(chrome.storage.local) as (query: unknown) => Promise<unknown>;
  (chrome.storage.local as any).get = (query: unknown) => {
    if (query === null) reads++;
    return get(query);
  };
  for (let i = 0; i < 5; i++) await chrome.storage.local.set({ disabled: [`z${i}`] });
  await advance(STATE_COALESCE_MS);
  assert.equal(reads, 1);
});

test("un démarrage sans réponse du service worker est retenté, une fois par délai", async (t) => {
  t.mock.method(console, "error", () => {});
  store.account = null;
  store.seen = ["a"];
  const sendMessage = chrome.runtime.sendMessage;
  let attempts = 0;
  (chrome.runtime as any).sendMessage = async () => {
    attempts++;
    return undefined;
  };
  await openTab();
  assert.equal(attempts, 1);
  // D'autres écritures, pendant l'attente, n'ajoutent pas de nouvel essai programmé.
  await chrome.storage.local.set({ disabled: ["z"] });
  await advance(STATE_COALESCE_MS);
  assert.equal(attempts, 2);
  await advance(NETWORK_RETRY_MS, 10_000);
  assert.equal(attempts, 3);
  await advance(NETWORK_RETRY_MS - 1000, 10_000);
  assert.equal(attempts, 3);

  (chrome.runtime as any).sendMessage = sendMessage;
  await advance(NETWORK_RETRY_MS, 10_000);
  assert.equal(store.account, "1");
});

test("un script orphelin rend le verrou sans attendre la fin de sa pause", async () => {
  store.seen = ["a"];
  store.pauseUntil = T0 + 15 * 60_000;
  await openTab();
  let freed = false;
  void navigator.locks.request("barrage-queue", async () => {
    freed = true;
  });
  await settle();
  assert.equal(freed, false);

  (chrome.runtime as any).id = undefined;
  await advance(SLEEP_SLICE_MS);
  assert.equal(freed, true);
  assert.deepEqual(x.requests, []);
});

test("une longue pause dure jusqu'au bout, découpée ou non", async () => {
  store.seen = ["a"];
  store.pauseUntil = T0 + 5 * 60_000;
  await openTab();
  await advance(5 * 60_000 - 1000, 10_000);
  assert.deepEqual(x.posts(BLOCK), []);
  await advance(2000);
  assert.ok(x.requests.length > 0);
});
