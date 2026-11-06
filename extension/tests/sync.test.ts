import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { IMPORT_LIST, REFRESH_LISTS } from "../src/core/messages.ts";
import { getState, resultKey, unblockQueue } from "../src/core/state.ts";
import { BAD_HOST_MESSAGE, DOWNLOAD_ERROR, TABLE_MESSAGE } from "../src/features/lists/import.ts";
import { officialList, type ListDef } from "../src/features/lists/lists.ts";
import { syncLists } from "../src/features/lists/sync.ts";
import { installChrome } from "./helpers/chrome.ts";

const GITHUB = "https://raw.githubusercontent.com/a/b/main/l.txt";

let store: Record<string, unknown>;
/** Réponses du faux réseau, par fin d'adresse. */
let responses: Record<string, () => Response>;
let fetched: Array<{ url: string; init?: RequestInit }>;
let listeners: Array<(message: unknown, sender: unknown, reply: (value: unknown) => void) => boolean>;

const send = (message: unknown): Promise<any> =>
  new Promise((resolve) => {
    for (const listener of listeners) if (listener(message, {}, resolve)) return;
    throw new Error("message sans réponse");
  });

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
  listeners = [];
  const event = { addListener() {} };
  installChrome(() => store, {
    alarms: { onAlarm: event, create() {} },
    runtime: { onMessage: { addListener: (l: (typeof listeners)[number]) => listeners.push(l) }, onInstalled: event, onStartup: event },
  });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    fetched.push({ url, ...(init ? { init } : {}) });
    const match = Object.keys(responses).find((end) => url.endsWith(end));
    if (!match) return new Response("", { status: 404 });
    return (responses[match] as () => Response)();
  }) as typeof fetch;
  syncLists();
});

test("un compte retiré de la collaborative est mis à débloquer et quitte les réglages", async () => {
  store[resultKey("a")] = { state: "blocked", at: 1 };
  store.disabled = ["a", "b"];
  store.seen = ["a", "c"];
  responses["/x.json"] = json(["b", "c", "d"]);
  await send({ type: REFRESH_LISTS });
  const state = await getState();
  assert.deepEqual(state.retired, ["a"]);
  assert.deepEqual(state.disabled, ["b"]);
  assert.deepEqual(state.seen, ["c"]);
  assert.deepEqual(unblockQueue(state), ["a"]);
  assert.ok(state.lists[0]?.syncedAt);
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
  const cases: Array<() => Response> = [
    () => new Response("", { status: 500 }),
    () => new Response("id,nom\n1,Alain\n2,David\n"),
    () => new Response("e ".repeat(600_000)),
  ];
  for (const response of cases) {
    responses["l.txt"] = response;
    await send({ type: REFRESH_LISTS });
    assert.deepEqual((await getState()).lists[1]?.handles, ["e"]);
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
  assert.deepEqual(reply, { ok: true, handles: ["e", "f"], duplicates: 1, invalid: ["!!"], url: GITHUB });
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
