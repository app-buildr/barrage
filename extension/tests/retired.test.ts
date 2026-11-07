import assert from "node:assert/strict";
import { test } from "node:test";
import { DELETED_LIST, lastRetiredAt, retiredChoice, retiredLines } from "../src/features/accounts/retired.ts";
import { OFFICIAL_NAME, officialList } from "../src/features/lists/lists.ts";
import { listDef, result } from "./helpers/fixtures.ts";

const base = {
  lists: [officialList(true), listDef("g", [], { name: "Nouvelle liste perso" })],
  results: { a: result("blocked"), b: result("blocked") },
};

test("chaque compte retiré porte le nom de sa liste, la collaborative par défaut", () => {
  const lines = retiredLines({
    ...base,
    retired: ["a", "b", "c"],
    retiredAt: {},
    retiredFrom: { b: "g", c: "supprimee" },
  });
  assert.deepEqual(lines, [
    { handle: "a", from: OFFICIAL_NAME, blocked: true },
    { handle: "b", from: "Nouvelle liste perso", blocked: true },
    { handle: "c", from: DELETED_LIST, blocked: false },
  ]);
});

test("la date affichée est celle du retrait le plus récent", () => {
  assert.equal(lastRetiredAt({ retired: ["a", "b"], retiredAt: { a: 5, b: 9, z: 20 } }), 9);
  assert.equal(lastRetiredAt({ retired: ["a"], retiredAt: {} }), null);
});

test("les comptes cochés sont à débloquer, les décochés restent bloqués", () => {
  assert.deepEqual(retiredChoice(["a", "b", "c"], new Set(["b"])), { unblock: ["a", "c"], keep: ["b"] });
  assert.deepEqual(retiredChoice(["a"], new Set()), { unblock: ["a"], keep: [] });
});
