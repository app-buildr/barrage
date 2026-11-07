import assert from "node:assert/strict";
import { test } from "node:test";
import { Batch } from "../src/features/timeline/batch.ts";

const settle = () => new Promise((resolve) => setImmediate(resolve));

function batch(canSend = () => true) {
  const sent: string[][] = [];
  const outcome = { fails: false };
  const send = async (handles: string[]) => {
    sent.push(handles);
    if (outcome.fails) throw new Error("perdu");
  };
  return { sent, outcome, batch: new Batch(send, canSend) };
}

test("un compte n'est envoyé qu'une fois, même revu dans plusieurs tweets", () => {
  const { sent, batch: b } = batch();
  b.add("a");
  b.add("a");
  b.flush();
  b.add("a");
  b.flush();
  assert.deepEqual(sent, [["a"]]);
});

test("rien à envoyer : aucun appel", () => {
  const { sent, batch: b } = batch();
  b.flush();
  assert.deepEqual(sent, []);
});

test("un envoi perdu est retenté au prochain passage", async () => {
  const { sent, outcome, batch: b } = batch();
  outcome.fails = true;
  b.add("a");
  b.flush();
  await settle();
  outcome.fails = false;
  b.add("a");
  b.flush();
  assert.deepEqual(sent, [["a"], ["a"]]);
});

test("session passée sur un autre compte : ce qui attend est oublié, jamais envoyé", () => {
  let same = false;
  const { sent, batch: b } = batch(() => same);
  b.add("a");
  b.flush();
  same = true;
  b.flush();
  assert.deepEqual(sent, []);
});

test("un compte sorti de la file peut être renvoyé, les autres non", () => {
  const { sent, batch: b } = batch();
  b.add("a");
  b.add("b");
  b.flush();
  b.keepOnly(new Set(["b"]));
  b.add("a");
  b.add("b");
  b.flush();
  assert.deepEqual(sent, [["a", "b"], ["a"]]);
});
