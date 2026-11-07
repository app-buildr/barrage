// Le chemin de production d'une écriture : write(), message, serveWrites.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { WRITE } from "../src/core/messages.ts";
import { getState } from "../src/core/state.ts";
import { write } from "../src/core/write.ts";
import { serial, serveWrites } from "../src/core/writer.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { installChrome } from "./helpers/chrome.ts";

let store: Record<string, unknown>;
let send: (message: unknown) => Promise<unknown>;

beforeEach(() => {
  store = { remote: ["a", "b", "c"], lists: [officialList(true)], onboarded: true };
  send = installChrome(() => store).sendMessage;
  serveWrites();
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
