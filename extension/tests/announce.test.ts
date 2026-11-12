import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { getState, resultKey } from "../src/core/state.ts";
import { serveWrites } from "../src/core/writer.ts";
import { WRITES } from "../src/features/writes.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { createAnnouncer } from "../src/features/notifications/announce.ts";
import { profileKey } from "../src/features/profiles/store.ts";
import type { Content } from "../src/features/notifications/toasts.ts";
import { installChrome, X_TAB } from "./helpers/chrome.ts";
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
  installChrome(() => store, { sender: X_TAB });
  serveWrites(WRITES);
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

test("un blocage est annoncé avec le profil enregistré, s'il y en a un", async () => {
  const profile = { name: "Compte A", screenName: "A", avatar: null, bio: "Bio", followers: 12, verified: true };
  store[profileKey("a")] = profile;
  store[profileKey("b")] = { name: "mal formé" };
  await announce({ ...change("a", null, "blocked"), ...change("b", null, "blocked") });
  assert.deepEqual(shown.map((s) => s.content.profile), [profile, undefined]);
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

test("« Annuler » qui échoue le dit, sans rien confirmer, et garde les déblocages suivants annoncés", async () => {
  await announce(change("a", null, "blocked"));
  const send = chrome.runtime.sendMessage;
  (chrome.runtime as any).sendMessage = async () => ({ ok: false, error: "panne" });
  shown[0]?.content.undo?.();
  await new Promise((resolve) => setTimeout(resolve, 2));
  (chrome.runtime as any).sendMessage = send;
  assert.equal(shown.length, 2);
  assert.match(shown[1]?.content.title ?? "", /annulation impossible/);
  assert.equal(shown[1]?.content.undo, undefined);

  await announce(change("a", "blocked", "unblocked"));
  assert.equal(shown[2]?.content.kind, "unblocked");
});

test("« Annuler » dans un onglet orphelin dit que le compte reste bloqué, sans écrire", async () => {
  await announce(change("a", null, "blocked"));
  const { id } = chrome.runtime;
  (chrome.runtime as any).id = undefined;
  shown[0]?.content.undo?.();
  (chrome.runtime as any).id = id;
  assert.match(shown[1]?.content.title ?? "", /annulation impossible/);
  assert.deepEqual((await getState()).disabled, []);
});

test("une annulation aboutie dans un onglet caché ne retient pas le compte pour la suite", async () => {
  let visible = true;
  announce = createAnnouncer((handle, content) => shown.push({ handle, content }), () => visible);
  await announce(change("a", null, "blocked"));
  shown[0]?.content.undo?.();
  await new Promise((resolve) => setTimeout(resolve, 2));
  visible = false;
  await announce(change("a", "blocked", "unblocked"));
  assert.equal(shown.length, 2);
  visible = true;
  await announce(change("a", "blocked", "unblocked"));
  assert.equal(shown.length, 3);
});

test("onglet caché sans annulation en cours : rien n'est lu ni dessiné", async () => {
  announce = createAnnouncer((handle, content) => shown.push({ handle, content }), () => false);
  await announce(change("a", null, "blocked"));
  assert.deepEqual(shown, []);
});
