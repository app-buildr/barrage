import assert from "node:assert/strict";
import { test } from "node:test";
import { compactCount, formatCount, percent, plural, pluralWord } from "../src/core/format.ts";
import { formatAgo, formatList } from "../src/core/intl.ts";
import { pageTitle, tabFromHash } from "../src/ui/layout/main-tab.ts";

test("le pluriel suit le nombre", () => {
  assert.equal(plural(0, "compte"), "0 compte");
  assert.equal(plural(1, "compte"), "1 compte");
  assert.equal(plural(2, "compte"), "2 comptes");
  assert.equal(plural(2, "compte retenu", "comptes retenus"), "2 comptes retenus");
});

test("le mot seul suit le nombre, et les grands nombres sont séparés", () => {
  assert.equal(pluralWord(1, "bloqué"), "bloqué");
  assert.equal(pluralWord(2, "bloqué"), "bloqués");
  assert.equal(formatCount(1425), "1\u202f425");
  assert.equal(plural(1425, "compte"), "1\u202f425 comptes");
});

test("les énumérations et les durées passent par Intl", () => {
  assert.equal(formatList(["a", "b", "c"], "and"), "a, b et c");
  assert.equal(formatList(["a", "b"], "or"), "a ou b");
  assert.equal(formatList(["a"], "and"), "a");
  assert.equal(formatAgo(30_000), "à l'instant");
  assert.equal(formatAgo(5 * 60_000), "il y a 5\u00a0min");
  assert.equal(formatAgo(2 * 3_600_000), "il y a 2\u00a0h");
  assert.equal(formatAgo(3 * 86_400_000), "il y a 3\u00a0j");
});

test("les grands nombres s'abrègent comme sur X, arrondis vers le bas", () => {
  const nbsp = (value: string) => value.replaceAll(" ", "\u00a0");
  assert.equal(compactCount(0), "0");
  assert.equal(compactCount(845), "845");
  assert.equal(compactCount(1_000), nbsp("1 k"));
  assert.equal(compactCount(12_459), nbsp("12,4 k"));
  assert.equal(compactCount(999_999), nbsp("999,9 k"));
  assert.equal(compactCount(1_000_000), nbsp("1 M"));
  assert.equal(compactCount(1_250_000), nbsp("1,2 M"));
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

test("le titre de la page suit l'écran affiché", () => {
  assert.equal(pageTitle("accueil"), "Bienvenue sur Barrage");
  assert.equal(pageTitle("reglages"), "Réglages · Barrage");
});
