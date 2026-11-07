import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { LIST_MAX_BYTES, RETIRE_GRACE_MS } from "../src/core/config.ts";
import { IMPORT_LIST, REFRESH_LISTS } from "../src/core/messages.ts";
import { getState, resultKey, unblockQueue } from "../src/core/state.ts";
import { BAD_HOST_MESSAGE, DOWNLOAD_ERROR, INVALID_WARNING, TABLE_MESSAGE } from "../src/features/lists/import.ts";
import { officialList, type ListDef } from "../src/features/lists/lists.ts";
import { acceptPendingList } from "../src/features/lists/store.ts";
import { refreshLists, syncLists } from "../src/features/lists/sync.ts";
import { checkLatestVersion } from "../src/features/updates/check.ts";
import { installChrome } from "./helpers/chrome.ts";

const GITHUB = "https://raw.githubusercontent.com/a/b/main/l.txt";

let store: Record<string, unknown>;
/** Réponses du faux réseau, par fin d'adresse. */
let responses: Record<string, () => Response>;
let fetched: Array<{ url: string; init?: RequestInit }>;
let send: (message: unknown) => Promise<any>;

const json = (value: unknown) => () => new Response(JSON.stringify(value));
const github = (handles: string[], extra: Partial<ListDef> = {}): ListDef => ({
  id: "g",
  name: "g",
  source: "github",
  url: GITHUB,
  handles,
  active: true,
  networks: ["x"],
  addedAt: 0,
  ...extra,
});

beforeEach(() => {
  store = { remote: ["a", "b", "c", "d"], lists: [officialList(true)], onboarded: true };
  responses = {};
  fetched = [];
  send = installChrome(() => store).sendMessage;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    fetched.push({ url, ...(init ? { init } : {}) });
    const match = Object.keys(responses).find((end) => url.endsWith(end));
    if (!match) return new Response("", { status: 404 });
    return (responses[match] as () => Response)();
  }) as typeof fetch;
  syncLists(refreshLists);
});

test("un compte retiré de la collaborative n'est débloqué qu'après le délai de grâce", async () => {
  store[resultKey("a")] = { state: "blocked", at: 1 };
  store.seen = ["a", "c"];
  responses["/x.json"] = json(["b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  const state = await getState();
  const at = state.retiredAt.a as number;
  assert.deepEqual(state.retired, ["a"]);
  assert.deepEqual(state.seen, ["c"]);
  assert.deepEqual(unblockQueue(state, at + RETIRE_GRACE_MS - 1), []);
  assert.deepEqual(unblockQueue(state, at + RETIRE_GRACE_MS), ["a"]);
  assert.ok(state.lists[0]?.syncedAt);
});

test("une liste corrigée pendant le délai de grâce ne débloque rien", async () => {
  store[resultKey("a")] = { state: "blocked", at: 1 };
  responses["/x.json"] = json(["b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  responses["/x.json"] = json(["a", "b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  const state = await getState();
  assert.deepEqual(state.retired, []);
  assert.deepEqual(unblockQueue(state, Date.now() + 2 * RETIRE_GRACE_MS), []);
});

test("un compte retiré avant ce délai attend d'être daté, et garde sa date ensuite", async () => {
  store.retired = ["z"];
  store[resultKey("z")] = { state: "blocked", at: 1 };
  assert.deepEqual(unblockQueue(await getState(), Date.now() + 2 * RETIRE_GRACE_MS), []);
  responses["/x.json"] = json(["a", "b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  const at = (await getState()).retiredAt.z as number;
  assert.ok(at > 1);
  store.retiredAt = { z: 5 };
  await send({ type: REFRESH_LISTS });
  assert.equal((await getState()).retiredAt.z, 5);
});

test("un compte sur Off sorti de la liste garde ce réglage s'il y revient", async () => {
  store.disabled = ["a", "b"];
  responses["/x.json"] = json(["b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  assert.deepEqual((await getState()).disabled, ["a", "b"]);
  responses["/x.json"] = json(["a", "b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  assert.deepEqual((await getState()).disabled, ["a", "b"]);
});

const accounts = (count: number, from = 0) => Array.from({ length: count }, (_, i) => `c${from + i}`);

test("une liste refusée n'applique rien et attend dans les options", async () => {
  const base = accounts(100);
  store.remote = base;
  store[resultKey("c0")] = { state: "blocked", at: 1 };
  store.seen = ["c0"];
  store.disabled = ["c1"];
  const list = store.lists;
  responses["/x.json"] = json(base.slice(60));
  await send({ type: REFRESH_LISTS });
  const state = await getState();
  assert.deepEqual(state.remote, base);
  assert.deepEqual(state.retired, []);
  assert.deepEqual(state.seen, ["c0"]);
  assert.deepEqual(state.disabled, ["c1"]);
  assert.deepEqual(store.lists, list);
  assert.equal(state.lists[0]?.syncedAt, undefined);
  assert.deepEqual(state.listGuards.official?.pending?.handles, base.slice(60));
  assert.equal(state.listGuards.official?.pending?.reason, "60 comptes retirés d'un coup sur 100");
});

test("une liste acceptée dans les options s'applique, et ses retraits attendent le délai de grâce", async () => {
  const base = accounts(100);
  store.remote = base;
  store[resultKey("c0")] = { state: "blocked", at: 1 };
  store.disabled = ["c1"];
  responses["/x.json"] = json(base.slice(60));
  await send({ type: REFRESH_LISTS });
  await acceptPendingList("official");
  const state = await getState();
  assert.deepEqual(state.remote, base.slice(60));
  assert.deepEqual(state.retired, ["c0"]);
  assert.deepEqual(unblockQueue(state), []);
  assert.equal(state.listGuards.official?.pending, undefined);
  assert.deepEqual(state.listGuards.official?.rollback, base);
  assert.deepEqual(state.disabled, ["c1"]);
  // La même liste, téléchargée de nouveau, ne revient pas en attente.
  await send({ type: REFRESH_LISTS });
  assert.equal((await getState()).listGuards.official?.pending, undefined);
  // Le retour arrière ne se heurte pas à la garde de retrait.
  responses["/x.json"] = json(base);
  await send({ type: REFRESH_LISTS });
  assert.deepEqual((await getState()).remote, base);
  assert.deepEqual((await getState()).retired, []);
});

test("une liste corrigée en ligne fait disparaître la mise à jour en attente", async () => {
  const base = accounts(100);
  store.remote = base;
  responses["/x.json"] = json([...base, ...accounts(300, 100)]);
  await send({ type: REFRESH_LISTS });
  assert.ok((await getState()).listGuards.official?.pending);
  responses["/x.json"] = json(base);
  await send({ type: REFRESH_LISTS });
  assert.equal((await getState()).listGuards.official?.pending, undefined);
});

test("les retraits enchaînés de la collaborative finissent en attente", async () => {
  const base = accounts(1000);
  store.remote = base;
  for (const size of [910, 820]) {
    responses["/x.json"] = json(base.slice(1000 - size));
    await send({ type: REFRESH_LISTS });
  }
  const state = await getState();
  assert.equal(state.remote?.length, 910);
  assert.equal(state.listGuards.official?.pending?.handles?.length, 820);
});

test("un fichier invalide se voit dans les options, sans rien à accepter", async () => {
  responses["/x.json"] = json({ pas: "une liste" });
  await send({ type: REFRESH_LISTS });
  const pending = (await getState()).listGuards.official?.pending;
  assert.equal(pending?.reason, "le fichier n'est pas une liste");
  assert.equal(pending?.handles, undefined);
  await assert.rejects(acceptPendingList("official"));
});

test("une liste GitHub refusée attend aussi, et ses comptes retirés restent bloqués", async () => {
  const base = accounts(100);
  store.lists = [officialList(true), github(base)];
  store[resultKey("c0")] = { state: "blocked", at: 1 };
  responses["l.txt"] = () => new Response(base.slice(50).join("\n"));
  await send({ type: REFRESH_LISTS });
  assert.deepEqual((await getState()).lists[1]?.handles, base);
  assert.equal((await getState()).listGuards.g?.pending?.handles?.length, 50);
  await acceptPendingList("g");
  const state = await getState();
  assert.deepEqual(state.lists[1]?.handles, base.slice(50));
  assert.deepEqual(state.retired, []);
  assert.equal(state.listGuards.g?.pending, undefined);
});

test("une liste GitHub devenue illisible se voit dans les options", async () => {
  store.lists = [officialList(true), github(["e"])];
  responses["l.txt"] = () => new Response("id,nom\n1,Alain\n2,David\n");
  await send({ type: REFRESH_LISTS });
  assert.equal((await getState()).listGuards.g?.pending?.reason, TABLE_MESSAGE);
});

test("un compte retiré mais couvert par une autre liste active n'est pas concerné", async () => {
  store.lists = [officialList(true), { ...github(["a"]), url: "" }];
  store[resultKey("a")] = { state: "blocked", at: 1 };
  store.disabled = ["a"];
  responses["/x.json"] = json(["b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  const state = await getState();
  assert.deepEqual(state.retired, []);
  assert.deepEqual(state.disabled, ["a"]);
});

test("une liste désactivée ne protège pas un compte retiré de la collaborative", async () => {
  store.lists = [officialList(true), { ...github(["a"], { active: false }), url: "" }];
  store[resultKey("a")] = { state: "blocked", at: 1 };
  responses["/x.json"] = json(["b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  assert.deepEqual((await getState()).retired, ["a"]);
});

test("un compte remis dans la collaborative n'est plus à débloquer, même liste désactivée ensuite", async () => {
  store.retired = ["a"];
  store[resultKey("a")] = { state: "blocked", at: 1 };
  store.remote = ["b", "c", "d"];
  responses["/x.json"] = json(["a", "b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  assert.deepEqual((await getState()).retired, []);
});

test("les listes GitHub sont synchronisées, désactivées comprises", async () => {
  store.lists = [officialList(true), github(["e"], { active: false })];
  responses["l.txt"] = () => new Response("@e\nf\n");
  await send({ type: REFRESH_LISTS });
  const list = (await getState()).lists[1];
  assert.deepEqual(list?.handles, ["e", "f"]);
  assert.ok(list?.syncedAt);
});

test("une liste GitHub illisible, en tableau ou trop grosse garde son contenu", async () => {
  store.lists = [officialList(true), github(["e"])];
  const cases: Array<[string, () => Response]> = [
    ["erreur HTTP", () => new Response("", { status: 500 })],
    ["tableau", () => new Response("id,nom\n1,Alain\n2,David\n")],
    ["trop grosse", () => new Response("e ".repeat(600_000))],
  ];
  for (const [label, response] of cases) {
    responses["l.txt"] = response;
    await send({ type: REFRESH_LISTS });
    assert.deepEqual((await getState()).lists[1]?.handles, ["e"], label);
  }
});

test("l'adresse d'une liste enregistrée est revalidée avant toute requête", async () => {
  store.lists = [officialList(true), github(["e"], { url: "https://evil.example/l.txt" })];
  await send({ type: REFRESH_LISTS });
  assert.ok(!fetched.some(({ url }) => url.includes("evil.example")));
});

test("l'import analyse sans rien enregistrer, sans redirection ni cookies", async () => {
  responses["l.txt"] = () => new Response("@e f f !!");
  const before = structuredClone(store);
  const reply = await send({ type: IMPORT_LIST, url: GITHUB });
  assert.deepEqual(reply, {
    ok: true,
    handles: ["e", "f"],
    duplicates: 1,
    invalid: ["!!"],
    warning: INVALID_WARNING,
    url: GITHUB,
  });
  assert.deepEqual(store, before);
  assert.equal(fetched[0]?.init?.redirect, "error");
  assert.equal(fetched[0]?.init?.credentials, "omit");
});

test("l'import refuse une adresse étrangère sans la contacter", async () => {
  assert.deepEqual(await send({ type: IMPORT_LIST, url: "https://evil.example/l.txt" }), { ok: false, reason: BAD_HOST_MESSAGE });
  assert.equal(fetched.length, 0);
});

test("l'import rend compte d'un tableau et d'un téléchargement impossible", async () => {
  responses["l.txt"] = () => new Response("id,nom\n1,Alain\n2,David\n");
  assert.deepEqual(await send({ type: IMPORT_LIST, url: GITHUB }), { ok: false, reason: TABLE_MESSAGE });
  delete responses["l.txt"];
  assert.deepEqual(await send({ type: IMPORT_LIST, url: GITHUB }), { ok: false, reason: DOWNLOAD_ERROR });
});

test("un téléchargement de la collaborative ne suit pas de redirection et n'envoie pas de cookie", async () => {
  responses["/x.json"] = json(["a", "b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  const init = fetched.find(({ url }) => url.endsWith("/x.json"))?.init;
  assert.equal(init?.redirect, "error");
  assert.equal(init?.credentials, "omit");
});

test("une réponse qui n'est pas un tableau n'écrit rien d'autre qu'un refus", async () => {
  responses["/x.json"] = json({ handles: ["z"] });
  await send({ type: REFRESH_LISTS });
  const state = await getState();
  assert.deepEqual(state.remote, ["a", "b", "c", "d"]);
  assert.deepEqual(store.lists, [officialList(true)]);
  assert.equal(state.listGuards.official?.pending?.reason, "le fichier n'est pas une liste");
  assert.equal(state.listGuards.official?.pending?.handles, undefined);
});

test("une réponse illisible, en erreur ou trop grosse laisse tout en place, avec une trace", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const before = JSON.stringify(store);
  const cases: Array<[string, () => Response]> = [
    ["JSON illisible", () => new Response("<html>")],
    ["erreur HTTP", () => new Response("", { status: 503 })],
    ["taille annoncée", () => new Response("[]", { headers: { "content-length": String(LIST_MAX_BYTES + 1) } })],
    ["taille réelle", () => new Response(`["${"a".repeat(LIST_MAX_BYTES)}"]`)],
  ];
  for (const [label, response] of cases) {
    warn.mock.resetCalls();
    responses["/x.json"] = response;
    await send({ type: REFRESH_LISTS });
    assert.equal(JSON.stringify(store), before, label);
    assert.equal(warn.mock.callCount(), 1, label);
  }
});

test("hors ligne, rien n'est signalé", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const online = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => Object.defineProperty(globalThis, "navigator", online as PropertyDescriptor));
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  await send({ type: REFRESH_LISTS });
  assert.equal(warn.mock.callCount(), 0);
});

test("la dernière version publiée est relevée, sans redirection ni cookie", async () => {
  responses["/releases/latest"] = json({ tag_name: "v9.8.7" });
  await checkLatestVersion();
  assert.equal((await getState()).latestVersion, "9.8.7");
  const init = fetched.find(({ url }) => url.endsWith("/releases/latest"))?.init;
  assert.equal(init?.redirect, "error");
  assert.equal(init?.credentials, "omit");
});

test("une réponse de GitHub refusée ou sans version laisse la version relevée", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  store.latestVersion = "1.0.0";
  responses["/releases/latest"] = () => new Response("", { status: 403 });
  await checkLatestVersion();
  assert.equal(warn.mock.callCount(), 1);
  responses["/releases/latest"] = json({ tag_name: "pas une version" });
  await checkLatestVersion();
  assert.equal(store.latestVersion, "1.0.0");
});
