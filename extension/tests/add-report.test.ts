import assert from "node:assert/strict";
import { test } from "node:test";
import { addReport } from "../src/features/accounts/add-report.ts";

const reply = (added: string[], existing: string[] = [], inactive = false) => ({ added, existing, inactive });

test("un ajout réussi nomme les comptes", () => {
  const report = addReport(reply(["a", "b", "c"]), []);
  assert.equal(report.kind, "ok");
  assert.match(report.message, /^3 comptes ajoutés : @a, @b et @c\.$/);
});

test("au-delà de cinq noms, le reste est compté", () => {
  const report = addReport(reply(["a", "b", "c", "d", "e", "f", "g"]), []);
  assert.match(report.message, /@e et 2 autres\.$/);
});

test("rien de neuf : mise en garde, un compte invalide seul : erreur", () => {
  assert.equal(addReport(reply([], ["a"]), []).kind, "warn");
  const invalid = addReport(reply([]), ["n'importe"]);
  assert.equal(invalid.kind, "error");
  assert.match(invalid.message, /Comptes invalides : n'importe\./);
});

test("un ajout partiel reste un succès, invalides signalés", () => {
  const report = addReport(reply(["a"]), ["n'importe"]);
  assert.equal(report.kind, "ok");
  assert.match(report.message, /1 compte ajouté : @a\. Comptes invalides/);
});

test("une liste perso désactivée n'est signalée que si un compte a été ajouté", () => {
  assert.match(addReport(reply(["a"], [], true), []).message, /Ma liste perso est désactivée/);
  assert.doesNotMatch(addReport(reply([], ["a"], true), []).message, /désactivée/);
});
