// Enchaînement réel d'une mise à jour, par entries/background.ts : migration,
// réparation, badges, liste intégrée. Les fixtures reproduisent le contenu du
// stockage écrit par chaque version, d'après le code de ses tags, avec des
// comptes inventés.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { accountStates, getState, resultKey } from "../src/core/state.ts";
import { write } from "../src/core/write.ts";
import { unblockQueue } from "../src/features/blocking/queue.ts";
import { DEFAULT_HANDLES } from "../src/features/lists/defaults.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { completeOnboarding, receiveOfficial } from "../src/features/lists/store.ts";
import { migrate } from "../src/features/lists/migrate.ts";
import { installChrome } from "./helpers/chrome.ts";

type Stored = Record<string, unknown>;

const fixture = (version: string): Stored =>
  JSON.parse(readFileSync(new URL(`./fixtures/storage/${version}.json`, import.meta.url), "utf8"));

const results = (stored: Stored) => Object.fromEntries(Object.entries(stored).filter(([key]) => key.includes("result:")));

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

let store: Stored;
let boots = 0;
let chromeStub: ReturnType<typeof installChrome>;

/** Démarrage du service worker. */
async function boot(): Promise<void> {
  await import(`../src/entries/background.ts?boot=${++boots}`);
  await settle();
}

async function update(previousVersion: string): Promise<void> {
  chromeStub.onInstalled.fire({ reason: "update", previousVersion });
  await settle();
}

function start(stored: Stored): void {
  store = stored;
  const event = { addListener() {} };
  chromeStub = installChrome(() => store, {
    commands: { onCommand: event },
    action: {
      onClicked: event,
      setBadgeTextColor: async () => {},
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
      setTitle: async () => {},
    },
    tabs: { create: async () => ({}) },
    runtime: { getURL: (path: string) => path, getContexts: async () => [], ContextType: { TAB: "TAB" } },
  });
}

beforeEach(() => {
  globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
});

for (const version of ["1.0.2", "1.1.0", "1.3.0"]) {
  test(`mise à jour depuis la ${version} : liste perso et résultats intacts, sans accueil`, async () => {
    const before = fixture(version);
    start(fixture(version));
    await boot();
    await update(version);
    const state = await getState();
    assert.equal(state.onboarded, true);
    assert.equal("handles" in store, false);
    const official = state.lists.find((list) => list.id === "official");
    assert.equal(official?.active, true);
    assert.deepEqual(state.lists.find((list) => list.id === "manual")?.handles, before.handles);
    for (const handle of before.handles as string[]) assert.ok(state.handles.includes(handle));
    for (const handle of before.remote as string[]) assert.ok(state.handles.includes(handle));
    assert.deepEqual(state.disabled, before.disabled);
    assert.equal(state.notify, before.notify !== false);
    // La réparation ne touche que la 1.1.0, testée à part.
    if (version !== "1.1.0") assert.deepEqual(results(store), results(before));
  });

  test(`mise à jour depuis la ${version} : un second passage ne change rien`, async () => {
    start(fixture(version));
    await boot();
    await update(version);
    const once = structuredClone(store);
    await update(version);
    await boot();
    assert.deepEqual(store, { ...once, bundled: store.bundled });
  });
}

test("depuis la 1.3.0 : rien de nouveau à débloquer, files et arrêts conservés", async () => {
  const before = fixture("1.3.0");
  start(fixture("1.3.0"));
  await boot();
  await update("1.3.0");
  const [first, second] = accountStates(store);
  assert.deepEqual(unblockQueue(first as never), []);
  assert.deepEqual(unblockQueue(second as never), ["liste_d"]);
  assert.deepEqual(second?.audit, ["liste_d"]);
  assert.equal(second?.pauseUntil, before["acct:222/pauseUntil"]);
  assert.deepEqual(second?.error, before["acct:222/error"]);
  assert.deepEqual(first?.seen, ["liste_c"]);
});

test("depuis la 1.3.0 : les badges sont rattrapés pour chaque compte X", async () => {
  start(fixture("1.3.0"));
  await boot();
  await update("1.3.0");
  const [first, second] = accountStates(store);
  assert.equal(first?.blockCount, 4);
  assert.equal(second?.blockCount, 2);
});

test("depuis la 1.1.0 : la réparation passe après la migration et rend les blocages hérités", async () => {
  start(fixture("1.1.0"));
  await boot();
  await update("1.1.0");
  const second = await getState("222");
  assert.equal(second.results.liste_a?.state, "blocked");
  assert.equal(second.results.liste_c?.state, "already_blocked");
  assert.equal(store.onboarded, true);
});

test("depuis la 1.3.0 : un « déjà bloqué » n'est plus réattribué à Barrage", async () => {
  const stored = fixture("1.3.0");
  stored["acct:222/result:liste_a"] = { state: "already_blocked", at: 5 };
  start(stored);
  await boot();
  await update("1.3.0");
  assert.equal((await getState("222")).results.liste_a?.state, "already_blocked");
});

test("sans liste reçue, un compte sorti de la liste intégrée attend le choix de l'utilisateur", async () => {
  const stored = fixture("1.3.0");
  delete stored.remote;
  stored.bundled = [...DEFAULT_HANDLES, "parti"];
  stored[resultKey("parti")] = { state: "blocked", at: 1 };
  start(stored);
  await boot();
  await update("1.3.0");
  const state = await getState("111");
  assert.deepEqual(state.retired, ["parti"]);
  assert.deepEqual(unblockQueue(state), []);
  assert.deepEqual(store.bundled, DEFAULT_HANDLES);
});

test("un événement onInstalled manqué se rattrape au démarrage suivant", async () => {
  start(fixture("1.3.0"));
  await boot();
  const state = await getState();
  assert.equal(state.onboarded, true);
  assert.deepEqual(state.lists.find((list) => list.id === "manual")?.handles.length, 4);
  assert.ok(state.lists.find((list) => list.id === "official")?.active);
});

test("une ancienne installation sans liste perso se reconnaît à ses résultats", async () => {
  const stored = fixture("1.3.0");
  delete stored.handles;
  start(stored);
  await boot();
  const state = await getState();
  assert.equal(state.onboarded, true);
  assert.deepEqual(state.lists.map((list) => list.id), ["official"]);
});

test("la liste intégrée est copiée dès le démarrage, et l'installation enchaîne badges puis premier téléchargement", async () => {
  const order: string[] = [];
  start({ account: "1", legacy: "1", accounts: { "1": {} }, [resultKey("a")]: { state: "blocked", at: 1 } });
  const set = chrome.storage.local.set;
  (chrome.storage.local as any).set = async (values: Stored) => {
    order.push(...Object.keys(values).filter((key) => key === "bundled" || key === "blockCount"));
    return set(values);
  };
  (chrome.alarms as any).create = () => void order.push("alarme");
  globalThis.fetch = (async () => {
    order.push("téléchargement");
    return new Response("", { status: 404 });
  }) as typeof fetch;
  await boot();
  assert.deepEqual(order, ["bundled"]);
  chromeStub.onInstalled.fire({ reason: "install" });
  await settle();
  assert.deepEqual(order.slice(0, 4), ["bundled", "blockCount", "alarme", "téléchargement"]);
});

test("le démarrage du navigateur planifie l'alarme, sans réécrire une liste intégrée à jour", async () => {
  const alarms: string[] = [];
  start({ onboarded: true, bundled: [...DEFAULT_HANDLES] });
  let writes = 0;
  const set = chrome.storage.local.set;
  (chrome.storage.local as any).set = async (values: Stored) => {
    writes++;
    return set(values);
  };
  (chrome.alarms as any).create = (name: string) => void alarms.push(name);
  await boot();
  chromeStub.onStartup.fire();
  await settle();
  assert.deepEqual(alarms, ["barrage-lists"]);
  assert.equal(writes, 0);
});

test("hors ligne, le premier démarrage a la liste intégrée", async () => {
  start({});
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  await boot();
  chromeStub.onInstalled.fire({ reason: "install" });
  await settle();
  assert.deepEqual((await getState()).official, DEFAULT_HANDLES);
});

for (const version of ["1.0.2", "1.1.0"]) {
  test(`depuis la ${version}, sans \`bundled\` ni liste reçue, la liste est là dès le démarrage, sans onInstalled`, async () => {
    const stored = fixture(version);
    delete stored.remote;
    delete stored.bundled;
    start(stored);
    await boot();
    assert.deepEqual((await getState()).official, DEFAULT_HANDLES);
    assert.deepEqual(results(store), results(fixture(version)));
  });
}

test("une écriture demandée au réveil du service worker passe après la liste intégrée", async () => {
  start({ lists: [officialList(true)], onboarded: true, account: "1", legacy: "1", accounts: { "1": {} } });
  await import(`../src/entries/background.ts?boot=${++boots}`);
  // Sans attendre la fin du démarrage : le compte neuf reçoit toute la liste à vérifier.
  await write("useAccount", "2", null);
  assert.deepEqual(store["acct:2/audit"], DEFAULT_HANDLES);
});

test("une liste reçue juste après la première copie n'est pas refusée pour écart", async () => {
  start({ lists: [officialList(true)], onboarded: true });
  await boot();
  assert.equal(await receiveOfficial([...DEFAULT_HANDLES, "nouveau"], 1), true);
  assert.deepEqual((await getState()).official, [...DEFAULT_HANDLES, "nouveau"]);
});

test("une copie périmée se rattrape au démarrage, même sans onInstalled, avec son délai de grâce", async () => {
  const stored = fixture("1.3.0");
  delete stored.remote;
  stored.bundled = [...DEFAULT_HANDLES, "parti"];
  stored[resultKey("parti")] = { state: "blocked", at: 1 };
  start(stored);
  await boot();
  assert.deepEqual(store.bundled, DEFAULT_HANDLES);
  assert.deepEqual((await getState("111")).retired, ["parti"]);
});

test("une migration qui échoue n'empêche ni les étapes suivantes ni le téléchargement", async (t) => {
  const failure = t.mock.method(console, "error", () => {});
  start(fixture("1.3.0"));
  const get = chrome.storage.local.get;
  let failing = true;
  (chrome.storage.local as any).get = async (query: unknown) => {
    if (failing && Array.isArray(query)) throw new Error("lecture impossible");
    return (get as (query: unknown) => Promise<unknown>)(query);
  };
  let downloads = 0;
  globalThis.fetch = (async () => {
    downloads++;
    return new Response("", { status: 404 });
  }) as typeof fetch;
  await boot();
  chromeStub.onInstalled.fire({ reason: "update", previousVersion: "1.3.0" });
  await settle();
  failing = false;
  assert.ok(failure.mock.callCount() >= 1);
  assert.ok(downloads >= 1);
  assert.deepEqual(store.bundled, DEFAULT_HANDLES);
});

test("une mise à jour depuis une version sans aucune donnée n'affiche pas l'accueil", async () => {
  start({});
  await migrate("1.3.0");
  assert.equal((await getState()).onboarded, true);
});

test("une nouvelle installation garde son accueil, même avec une session X déjà vue", async () => {
  start({ account: "1", legacy: "1", accounts: { "1": {} }, bundled: [], remote: ["a"], audit: [] });
  await boot();
  chromeStub.onInstalled.fire({ reason: "install" });
  await settle();
  await migrate();
  assert.equal((await getState()).onboarded, false);
  assert.equal("lists" in store, false);
});

test("une écriture échouée ne perd rien, et le démarrage suivant reprend", async () => {
  start(fixture("1.3.0"));
  const set = chrome.storage.local.set;
  (chrome.storage.local as any).set = async () => {
    throw new Error("disque plein");
  };
  await assert.rejects(migrate());
  assert.equal(Array.isArray(store.handles), true);
  (chrome.storage.local as any).set = set;
  await migrate();
  assert.equal(store.onboarded, true);
  assert.equal("handles" in store, false);
});

test("une migration interrompue entre l'écriture et le retrait ne double rien", async () => {
  start(fixture("1.3.0"));
  const remove = chrome.storage.local.remove;
  (chrome.storage.local as any).remove = async () => {
    throw new Error("arrêt");
  };
  await assert.rejects(migrate());
  (chrome.storage.local as any).remove = remove;
  await migrate();
  assert.equal("handles" in store, false);
  const manual = (await getState()).lists.find((list) => list.id === "manual");
  assert.equal(manual?.handles.length, 4);
});

test("des listes sans accueil terminé sont gardées telles quelles", async () => {
  const lists = [officialList(false), { id: "l", name: "Autre", source: "file", handles: ["z"], active: true, networks: ["x"], addedAt: 1 }];
  start({ lists, handles: ["a"] });
  await migrate();
  const state = await getState();
  assert.equal(state.onboarded, true);
  assert.deepEqual(state.lists.map((list) => [list.id, list.active]), [["official", false], ["l", true], ["manual", true]]);
});

test("une clé handles restée après l'accueil rejoint la liste perso, réglages conservés", async () => {
  start({
    onboarded: true,
    notifyBadges: false,
    handles: ["a", "b"],
    lists: [officialList(false), { id: "manual", name: "Perso", source: "manual", handles: ["b", "c"], active: false, networks: ["x"], addedAt: 1 }],
  });
  await migrate();
  const manual = (await getState()).lists[1];
  assert.deepEqual(manual?.handles, ["b", "c", "a"]);
  assert.equal(manual?.active, false);
  assert.equal(store.notifyBadges, false);
  assert.equal("handles" in store, false);
});

test("une clé handles corrompue n'empêche rien, et n'efface rien d'exploitable", async () => {
  start({ handles: "pas une liste", "result:a": { state: "blocked", at: 1 } });
  await migrate();
  assert.equal(store.onboarded, true);
  assert.equal(store["result:a"] !== undefined, true);
  assert.deepEqual((await getState()).lists.map((list) => list.id), ["official"]);
});

test("l'accueil reprend une clé handles restée orpheline", async () => {
  start({ handles: ["a"] });
  await completeOnboarding({ kind: "later" });
  const state = await getState();
  assert.deepEqual(state.lists.find((list) => list.id === "manual")?.handles, ["a"]);
  assert.equal("handles" in store, false);
});
