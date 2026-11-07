import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNT_PAGE } from "../src/core/config.ts";
import { matches, moreLabel, noMatchMessage, normalizeQuery, shownCount } from "../src/features/accounts/filter.ts";

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

test("le bouton annonce la page suivante, ou ce qui reste, et disparaît à la fin", () => {
  assert.equal(moreLabel(ACCOUNT_PAGE, ACCOUNT_PAGE), null);
  assert.equal(moreLabel(10, ACCOUNT_PAGE), null);
  assert.equal(moreLabel(ACCOUNT_PAGE + 1, ACCOUNT_PAGE), "Afficher le compte suivant");
  assert.equal(moreLabel(ACCOUNT_PAGE + 2, ACCOUNT_PAGE), "Afficher les 2 comptes suivants");
  assert.match(moreLabel(5 * ACCOUNT_PAGE, ACCOUNT_PAGE) ?? "", new RegExp(`les ${ACCOUNT_PAGE} comptes`));
});

test("le décompte dit ce qui est monté", () => {
  assert.match(shownCount(1425, 200), /^200 comptes affichés sur 1.425$/);
});
