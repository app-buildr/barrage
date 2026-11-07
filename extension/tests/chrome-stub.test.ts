import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { onStateChange } from "../src/core/state.ts";
import { write } from "../src/core/write.ts";
import { serveWrites } from "../src/core/writer.ts";
import { installChrome } from "./helpers/chrome.ts";

let store: Record<string, unknown>;
const tick = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  store = {};
  installChrome(() => store);
});

test("le stockage ne garde que ce qui survit à JSON, et ne partage aucune référence", async () => {
  const value = { list: ["a"], set: new Set(["a"]), none: undefined, big: Infinity };
  await chrome.storage.local.set({ value, gone: undefined });
  value.list.push("b");
  assert.deepEqual(store, { value: { list: ["a"], set: {}, big: null } });
  const read = await chrome.storage.local.get(null);
  (read.value as { list: string[] }).list.push("c");
  assert.deepEqual((store.value as { list: string[] }).list, ["a"]);
});

test("onChanged donne l'ancienne et la nouvelle valeur des seules clés modifiées", async () => {
  store.same = 1;
  store.old = 1;
  const seen: unknown[] = [];
  chrome.storage.onChanged.addListener((changes, area) => seen.push([changes, area]));
  await chrome.storage.local.set({ same: 1, old: 2, fresh: 3 });
  await chrome.storage.local.remove(["old", "absent"]);
  await tick();
  assert.deepEqual(seen, [
    [{ old: { oldValue: 1, newValue: 2 }, fresh: { newValue: 3 } }, "local"],
    [{ old: { oldValue: 2 } }, "local"],
  ]);
});

test("un champ propre à un compte X réveille les écouteurs, quel que soit le compte", async () => {
  let calls = 0;
  const stop = onStateChange(() => calls++, ["seen", "results"]);
  await chrome.storage.local.set({ "acct:2/seen": ["a"] });
  await chrome.storage.local.set({ "acct:2/result:a": { state: "blocked", at: 1 } });
  await chrome.storage.local.set({ notify: false });
  await tick();
  assert.equal(calls, 2);
  stop();
  await chrome.storage.local.set({ seen: ["b"] });
  await tick();
  assert.equal(calls, 2);
});

test("write passe par serveWrites, et une écriture inconnue reste sans réponse", async () => {
  serveWrites();
  await write("setNotifications", { notifyBadges: false });
  assert.equal(store.notifyBadges, false);
  await assert.rejects((write as any)("__proto__"), /sans réponse/);
});
