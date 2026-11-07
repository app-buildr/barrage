// Le chemin de production d'une écriture : write(), message, serveWrites.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { IMPORT_LIST, REFRESH_LISTS, WRITE } from "../src/core/messages.ts";
import { getState } from "../src/core/state.ts";
import { write } from "../src/core/write.ts";
import { serial, serveWrites } from "../src/core/writer.ts";
import { WRITES } from "../src/features/writes.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { syncLists } from "../src/features/lists/sync.ts";
import { installChrome, X_TAB } from "./helpers/chrome.ts";

let store: Record<string, unknown>;
let send: (message: unknown) => Promise<unknown>;

beforeEach(() => {
  store = { remote: ["a", "b", "c"], lists: [officialList(true)], onboarded: true };
  send = installChrome(() => store).sendMessage;
  serveWrites(WRITES);
});

for (const name of ["__proto__", "constructor", "toString", "inconnu"]) {
  test(`le message refuse l'écriture « ${name} » : ni réponse ni modification`, async () => {
    const before = JSON.stringify(store);
    assert.equal(await send({ type: WRITE, name, args: [] }), undefined);
    assert.equal(JSON.stringify(store), before);
  });
}

test("le message refuse des arguments qui ne sont pas un tableau", async () => {
  assert.equal(await send({ type: WRITE, name: "addSeen", args: "a" }), undefined);
  assert.equal(store.seen, undefined);
});

test("le message refuse un autre type, et ce qui n'est pas un objet", async () => {
  assert.equal(await send({ type: "autre", name: "addSeen", args: [["a"]] }), undefined);
  assert.equal(await send(null), undefined);
  assert.equal(store.seen, undefined);
});

test("une écriture passe par le service worker et renvoie sa valeur", async () => {
  const reply = await write("addHandles", ["z"]);
  assert.deepEqual(reply, { added: ["z"], existing: [], inactiveList: null });
  assert.ok((await getState()).handles.includes("z"));
});

test("les arguments passent par JSON, comme dans un vrai message", async () => {
  const handles = new Set(["a"]) as unknown as string[];
  await assert.rejects(write("addSeen", handles));
});

test("une écriture qui échoue répond ok: false, avec le seul message de l'erreur", async () => {
  const reply = await send({ type: WRITE, name: "renameList", args: ["official", "Nom"] });
  assert.deepEqual(reply, { ok: false, error: "La liste collaborative ne peut pas être renommée." });
  await assert.rejects(write("renameList", "official", "Nom"), /^Error: La liste collaborative/);
});

test("write() lève une erreur si personne ne répond", async () => {
  installChrome(() => store);
  await assert.rejects(write("addSeen", ["a"]), /sans réponse du service worker/);
});

test("deux écritures simultanées sont conservées toutes les deux", async () => {
  await Promise.all([write("addSeen", ["a"]), write("addSeen", ["b"])]);
  assert.deepEqual((await getState()).seen, ["a", "b"]);
});

test("serial applique les tâches dans l'ordre d'arrivée", async () => {
  const order: number[] = [];
  const slow = serial(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push(1);
  });
  const fast = serial(async () => void order.push(2));
  await Promise.all([slow, fast]);
  assert.deepEqual(order, [1, 2]);
});

test("une tâche rejetée n'arrête pas la file, et son appelant la voit", async () => {
  const failed = serial(async () => {
    throw new Error("échec");
  });
  const next = serial(async () => "suite");
  await assert.rejects(failed, /échec/);
  assert.equal(await next, "suite");
});

/** Même faux chrome, l'expéditeur étant un onglet x.com. */
function fromTab(sender: object = X_TAB) {
  const { sendMessage } = installChrome(() => store, { sender });
  serveWrites(WRITES);
  return sendMessage;
}

const CONTENT_WRITES = [
  "addSeen",
  "dismissBadge",
  "finishUnblock",
  "holdLookups",
  "markAlreadyBlocked",
  "recordAudit",
  "recordBlockFailure",
  "recordBlockSuccess",
  "recordChecks",
  "recordRequest",
  "refuseUnblock",
  "setEnabled",
  "setHealth",
  "syncBadges",
  "useAccount",
];

test("un onglet x.com n'a accès qu'aux écritures du traitement et du fil", () => {
  const permitted = Object.entries(WRITES).filter(([, entry]) => entry.content).map(([name]) => name);
  assert.deepEqual(permitted, CONTENT_WRITES);
  assert.equal(Object.hasOwn(WRITES, "updateListHandles"), false);
});

for (const [name, args] of [
  ["addList", [{ source: "file", handles: ["z"], networks: ["x"] }]],
  ["removeList", ["official"]],
  ["requestUnblock", ["a"]],
  ["restoreBackup", [{}]],
  ["setNotifications", [{ notify: false }]],
] as const) {
  test(`un onglet x.com ne peut pas demander ${name}`, async (t) => {
    t.mock.method(console, "warn", () => {});
    const before = JSON.stringify(store);
    const reply = await fromTab()({ type: WRITE, name, args });
    assert.deepEqual(reply, { ok: false, error: `Écriture refusée : ${name}.` });
    assert.equal(JSON.stringify(store), before);
  });
}

test("un message venu d'une autre extension n'est pas servi", async () => {
  const send = fromTab({ id: "autre", url: "chrome-extension://barrage/options.html" });
  assert.equal(await send({ type: WRITE, name: "addSeen", args: [["a"]] }), undefined);
  assert.equal(store.seen, undefined);
});

test("une page qui imite l'adresse des options n'y gagne rien", async (t) => {
  t.mock.method(console, "warn", () => {});
  const send = fromTab({ id: "barrage", url: "https://x.com/chrome-extension://barrage/options.html" });
  assert.equal(((await send({ type: WRITE, name: "removeList", args: ["l"] })) as { ok: boolean }).ok, false);
});

for (const [name, args] of [
  ["addHandles", [["@Nom"]]],
  ["addHandles", ["a"]],
  ["addSeen", [["pas valide"]]],
  ["addSeen", [["a"], "nom"]],
  ["addSeen", [["a"], "1", "de trop"]],
  ["finishUnblock", ["a", { state: "inventé", at: 1 }, {}]],
  ["finishUnblock", ["a", null, { lists: [] }]],
  ["finishUnblock", ["a", null, { error: false }]],
  ["recordAudit", [["a"], [], [], { remote: [] }]],
  ["recordChecks", [{ "pas valide": { state: "not_found", at: 1 } }, {}]],
  ["recordBlockFailure", ["a", { param: 1 }, 1]],
  ["recordRequest", ["autre"]],
  ["setHealth", ["autre"]],
  ["useAccount", ["nom", null]],
  ["setNotifications", [{ lists: [] }]],
  ["setNotifications", [{ notify: "oui" }]],
  ["addList", [{ source: "github", url: "https://exemple.com/x.json", handles: ["a"], networks: ["x"] }]],
  ["addList", [{ source: "official", handles: ["a"], networks: ["x"] }]],
  ["setListNetworks", ["official", ["myspace"]]],
  ["completeOnboarding", [{ kind: "official", networks: "x" }]],
] as const) {
  test(`arguments refusés pour ${name} : ${JSON.stringify(args)}`, async (t) => {
    t.mock.method(console, "warn", () => {});
    const before = JSON.stringify(store);
    const reply = await send({ type: WRITE, name, args });
    assert.deepEqual(reply, { ok: false, error: `Écriture refusée : ${name}.` });
    assert.equal(JSON.stringify(store), before);
  });
}

test("les écritures des options passent leurs contrôles, avec des arguments réels", async () => {
  store.lists = [officialList(true), { id: "l", name: "l", source: "file", handles: ["z"], active: false, networks: ["x"], addedAt: 0 }];
  const github = "https://raw.githubusercontent.com/compte/depot/main/x.txt";
  await write("addList", { source: "github", url: github, handles: ["y"], networks: ["x"] });
  await write("addList", { source: "file", handles: ["w"], networks: ["x"] });
  await write("addHandles", ["v"]);
  await write("setListActive", "l", true);
  await write("setListNetworks", "l", ["x"]);
  await write("renameList", "l", "Amis");
  await write("setListActive", "l", false);
  await write("removeList", "l");
  await write("requestBlock", "a");
  await write("requestUnblock", "b");
  await write("setEnabled", "b", true);
  await write("setNotifications", { notify: false });
  await write("setNotifications", { notifyBadges: true });
  await write("resumeBlocking");
  await write("completeOnboarding", { kind: "later" });
  assert.deepEqual(await write("restoreBackup", {}), { ok: false, reason: "Ce fichier n'est pas une sauvegarde de Barrage." });
});

test("rafraîchir ou analyser une liste n'est permis qu'aux options", async () => {
  let refreshes = 0;
  const { sendMessage } = installChrome(() => store, { sender: X_TAB });
  syncLists(async () => void refreshes++);
  assert.equal(await sendMessage({ type: REFRESH_LISTS }), undefined);
  assert.equal(await sendMessage({ type: IMPORT_LIST, url: "https://raw.githubusercontent.com/a/b/main/c.txt" }), undefined);
  assert.equal(refreshes, 0);
});
