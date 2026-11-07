import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { getState, resultKey } from "../src/core/state.ts";
import { serveWrites } from "../src/core/writer.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { createAnnouncer } from "../src/features/notifications/announce.ts";
import type { Content } from "../src/features/notifications/toasts.ts";
import { installChrome } from "./helpers/chrome.ts";
import { installX } from "./helpers/x.ts";

let store: Record<string, unknown>;
let shown: Array<{ handle: string; content: Content }>;
let announce: ReturnType<typeof createAnnouncer>;

const change = (handle: string, oldState: string | null, newState: string, prefix = "") => ({
  [resultKey(handle, prefix)]: {
    ...(oldState ? { oldValue: { state: oldState, at: 1 } } : {}),
    newValue: { state: newState, at: 2 },
  },
});

beforeEach(() => {
  store = { remote: ["a", "b"], lists: [officialList(true)], onboarded: true, account: "1", legacy: "1", accounts: { "1": {} } };
  shown = [];
  installChrome(() => store);
  serveWrites();
  installX();
  announce = createAnnouncer((handle, content) => shown.push({ handle, content }));
});

test("un blocage est annoncé, avec « Annuler »", async () => {
  await announce(change("a", null, "blocked"));
  assert.equal(shown.length, 1);
  assert.equal(shown[0]?.handle, "a");
  assert.equal(shown[0]?.content.kind, "blocked");
  assert.equal(typeof shown[0]?.content.undo, "function");
});

test("« Annuler » désactive le compte, le confirme, et le déblocage n'en reparle pas", async () => {
  await announce(change("a", null, "blocked"));
  shown[0]?.content.undo?.();
  await new Promise((resolve) => setTimeout(resolve, 2));
  assert.deepEqual((await getState()).disabled, ["a"]);
  assert.equal(shown.length, 2);
  assert.equal(shown[1]?.content.kind, "unblocked");
  assert.equal(shown[1]?.content.pausable, false);

  await announce(change("a", "blocked", "unblocked"));
  assert.equal(shown.length, 2);
  // Un déblocage suivant du même compte n'est plus couvert par l'annulation.
  await announce(change("a", "blocked", "unblocked"));
  assert.equal(shown.length, 3);
});

test("un déblocage sans annulation est annoncé", async () => {
  await announce(change("b", "blocked", "unblocked"));
  assert.equal(shown[0]?.content.kind, "unblocked");
  assert.equal(shown[0]?.content.undo, undefined);
});

test("notifications coupées : rien", async () => {
  store.notify = false;
  await announce(change("a", null, "blocked"));
  assert.deepEqual(shown, []);
});

test("le blocage d'un autre compte X n'est pas annoncé", async () => {
  await announce(change("a", null, "blocked", "acct:2/"));
  assert.deepEqual(shown, []);
});
