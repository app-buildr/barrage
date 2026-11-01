import assert from "node:assert/strict";
import { test } from "node:test";
import { matches, noMatchMessage, normalizeQuery } from "../src/features/accounts/filter.ts";

test("« @Nom » et « nom » cherchent la même chose", () => {
  assert.equal(normalizeQuery("  @Barrage "), "barrage");
  assert.equal(normalizeQuery("barrage"), "barrage");
});

test("un compte correspond au texte cherché et à la catégorie choisie", () => {
  const line = { handle: "barrage_app", category: "blocked" as const };
  assert.equal(matches(line, "", null), true);
  assert.equal(matches(line, "rage", null), true);
  assert.equal(matches(line, "autre", null), false);
  assert.equal(matches(line, "", "blocked"), true);
  assert.equal(matches(line, "", "visible"), false);
  assert.equal(matches(line, "rage", "visible"), false);
});

test("le message d'une liste vide dépend du filtre", () => {
  assert.equal(noMatchMessage("zz"), "Aucun compte ne correspond à « zz ».");
  assert.equal(noMatchMessage(""), "Aucun compte dans cette catégorie.");
});
