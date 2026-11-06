import assert from "node:assert/strict";
import { test } from "node:test";
import { percent, plural } from "../src/core/format.ts";
import { tabFromHash } from "../src/ui/layout/main-tab.ts";

test("le pluriel suit le nombre", () => {
  assert.equal(plural(0, "compte"), "0 compte");
  assert.equal(plural(1, "compte"), "1 compte");
  assert.equal(plural(2, "compte"), "2 comptes");
  assert.equal(plural(2, "compte retenu", "comptes retenus"), "2 comptes retenus");
});

test("le pourcentage est plafonné et sans division par zéro", () => {
  assert.equal(percent(1, 4), 25);
  assert.equal(percent(5, 4), 100);
  assert.equal(percent(1, 0), 0);
});

test("l'onglet vient du hash, Comptes par défaut", () => {
  assert.equal(tabFromHash("#badges"), "badges");
  assert.equal(tabFromHash("#reglages"), "reglages");
  assert.equal(tabFromHash("#accueil"), "comptes");
  assert.equal(tabFromHash(""), "comptes");
});
