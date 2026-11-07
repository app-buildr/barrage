import assert from "node:assert/strict";
import { test } from "node:test";
import { LIST_BASELINE_MS, LIST_MAX_SIZE } from "../src/core/config.ts";
import { blockedByBarrage } from "../src/features/blocking/queue.ts";
import {
  compareLists,
  confirmedGuard,
  guardReferences,
  parseList,
  readGuards,
  renewGuard,
  settledGuard,
} from "../src/features/lists/remote.ts";

test("une liste valide est normalisée et dédoublonnée", () => {
  assert.deepEqual(parseList(["@Alice", "bob", "alice", "https://x.com/Carol"]), {
    ok: true,
    handles: ["alice", "bob", "carol"],
  });
});

test("les entrées invalides sont écartées une à une", () => {
  assert.deepEqual(parseList(["alice", 42, "pas un compte !", null]), { ok: true, handles: ["alice"] });
});

test("un fichier vide, trop gros ou qui n'est pas une liste est refusé", () => {
  assert.equal(parseList([]).ok, false);
  assert.equal(parseList({ x: ["alice"] }).ok, false);
  assert.equal(parseList(Array.from({ length: LIST_MAX_SIZE + 1 }, (_, i) => `c${i}`)).ok, false);
});

test("seuls les comptes retirés que Barrage a bloqués sont à débloquer", () => {
  const results = {
    a: { state: "blocked" as const, at: 1 },
    b: { state: "already_blocked" as const, at: 1 },
  };
  const update = compareLists(["a", "b", "c", "d", "e"], ["c", "d", "e"], []);
  assert.deepEqual(update, { ok: true, removed: ["a", "b"] });
  assert.deepEqual(blockedByBarrage(["a", "b"], results), ["a"]);
});

test("un compte ajouté par l'utilisateur n'est jamais retiré", () => {
  assert.deepEqual(compareLists(["a", "b", "c"], ["b", "c"], ["a"]), { ok: true, removed: [] });
});

const accounts = (count: number, from = 0): string[] => Array.from({ length: count }, (_, i) => `c${from + i}`);

test("un retrait passe toujours, même massif : l'utilisateur choisit ensuite qui débloquer", () => {
  const base = accounts(1000);
  assert.deepEqual(compareLists(base, base.slice(900), []), { ok: true, removed: base.slice(0, 900) });
  assert.equal(compareLists(["a", "b", "c", "d", "e", "f"], ["f"], []).ok, true);
});

test("au-delà de la part d'ajouts permise, la liste est refusée, même si elle ne retire rien", () => {
  const base = accounts(1000);
  assert.equal(compareLists(base, [...base, ...accounts(250, 1000)], []).ok, true);
  const update = compareLists(base, [...base, ...accounts(251, 1000)], []);
  assert.deepEqual(update, { ok: false, reason: "251 comptes ajoutés d'un coup à 1000" });
});

test("une petite liste change sans refus, dans la limite du plancher", () => {
  assert.equal(compareLists(["a", "b"], ["a", "c", "d", "e", "f", "g"], []).ok, true);
  assert.equal(compareLists(["a", "b"], ["a", "c", "d", "e", "f", "g", "h"], []).ok, false);
});

test("des ajouts enchaînés se cumulent sur la référence, chacun sous le seuil", () => {
  const base = accounts(1000);
  const first = [...base, ...accounts(200, 1000)];
  assert.equal(compareLists(base, first, [], [base]).ok, true);
  assert.equal(compareLists(first, [...first, ...accounts(100, 2000)], [], [base]).ok, false);
});

test("revenir à la référence passe toujours, même après un gros ajout", () => {
  const base = accounts(1000);
  const bad = [...base, ...accounts(3500, 1000)];
  assert.deepEqual(compareLists(bad, base, [], [base]), { ok: true, removed: accounts(3500, 1000) });
});

test("une liste identique à celle en place passe, quelle que soit la référence", () => {
  const list = accounts(100);
  assert.equal(compareLists(list, [...list].reverse(), [], [accounts(1000, 500)]).ok, true);
});

test("une confirmation change de référence sans perdre le retour arrière", () => {
  const base = accounts(1000);
  const purged = base.slice(0, 300);
  const guard = confirmedGuard({ baseline: base, baselineAt: 1 }, purged, 2);
  assert.deepEqual(guard, { baseline: purged, baselineAt: 2, rollback: base });
  // La liste purgée évolue normalement, et le retour à l'ancienne passe aussi.
  assert.equal(compareLists(purged, [...purged, "nouveau"], [], guardReferences(guard)).ok, true);
  assert.equal(compareLists(purged, base, [], guardReferences(guard)).ok, true);
});

test("la référence se renouvelle à échéance, et une mise à jour en attente y survit", () => {
  const pending = { reason: "r", at: 1 };
  const guard = { baseline: ["a"], baselineAt: 10, rollback: ["z"], pending };
  assert.equal(renewGuard(guard, ["b"], 10 + LIST_BASELINE_MS - 1), guard);
  assert.deepEqual(renewGuard(guard, ["b"], 10 + LIST_BASELINE_MS), {
    baseline: ["b"],
    baselineAt: 10 + LIST_BASELINE_MS,
    pending,
  });
  assert.deepEqual(renewGuard(undefined, ["b"], 5), { baseline: ["b"], baselineAt: 5 });
  assert.deepEqual(settledGuard(guard), { baseline: ["a"], baselineAt: 10, rollback: ["z"] });
});

test("une garde corrompue est écartée, le reste est relu", () => {
  const guards = readGuards({
    bad: { baseline: "a", baselineAt: 1 },
    nul: null,
    good: { baseline: ["a", 1], baselineAt: 1, pending: { reason: "r", at: 2, handles: ["b", null] } },
    noPending: { baseline: [], baselineAt: 1, pending: { at: 2 } },
  });
  assert.deepEqual(Object.keys(guards), ["good", "noPending"]);
  assert.deepEqual(guards.good, { baseline: ["a"], baselineAt: 1, pending: { reason: "r", at: 2, handles: ["b"] } });
  assert.deepEqual(Object.keys(readGuards("x")), []);
});
