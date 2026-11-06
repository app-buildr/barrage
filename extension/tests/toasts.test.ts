import assert from "node:assert/strict";
import { test } from "node:test";
import { createBadgeStore, createToastStore, MAX_TOASTS, type Content } from "../src/features/notifications/toasts.ts";

const blocked: Content = { kind: "blocked", title: " vient d'être bloqué", detail: "par Barrage" };
const unblocked: Content = { kind: "unblocked", title: " a été débloqué.", detail: "" };

test("une notification encore visible est mise à jour au lieu d'en ajouter une", () => {
  const store = createToastStore();
  store.show("a", blocked);
  store.show("a", unblocked);
  const [toast, ...rest] = store.getSnapshot();
  assert.equal(rest.length, 0);
  assert.equal(toast?.content, unblocked);
  assert.equal(toast?.revision, 1);
});

test("une notification en train de partir n'est plus réutilisée", () => {
  const store = createToastStore();
  store.show("a", blocked);
  store.leave(store.getSnapshot()[0]!.id);
  store.show("a", unblocked);
  assert.equal(store.getSnapshot().length, 2);
});

test("au-delà du maximum, les plus anciennes cèdent la place", () => {
  const store = createToastStore();
  for (const handle of ["a", "b", "c", "d"]) store.show(handle, blocked);
  assert.deepEqual(
    store.getSnapshot().map((t) => t.handle),
    ["b", "c", "d"].slice(-MAX_TOASTS),
  );
});

test("les abonnés sont prévenus, et plus après désabonnement", () => {
  const store = createToastStore();
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  store.show("a", blocked);
  store.remove(store.getSnapshot()[0]!.id);
  unsubscribe();
  store.show("b", blocked);
  store.clear();
  assert.equal(calls, 2);
});

test("la notification de badge ne prévient que si le palier change", () => {
  const store = createBadgeStore();
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  store.set(10);
  store.set(10);
  assert.equal(store.getSnapshot(), 10);
  assert.equal(calls, 1);
  unsubscribe();
  store.set(null);
  assert.equal(calls, 1);
});
