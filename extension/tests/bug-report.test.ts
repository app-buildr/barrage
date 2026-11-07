import assert from "node:assert/strict";
import { test } from "node:test";
import { bugReportUrl } from "../src/ui/layout/bug-report.ts";

test("sans état lisible, le nombre de listes n'est pas inventé", () => {
  const url = new URL(bugReportUrl({ version: "1.4.0", userAgent: "Chrome/1", tab: "page d'erreur" }));
  assert.doesNotMatch(url.searchParams.get("body") ?? "", /Listes actives/);
});

test("le lien de bug est pré-rempli, sans donnée personnelle", () => {
  const url = new URL(bugReportUrl({ version: "1.4.0", userAgent: "Chrome/1", tab: "badges", activeLists: 2 }));
  assert.equal(url.pathname, "/app-buildr/barrage/issues/new");
  assert.equal(url.searchParams.get("title"), "Bug : ");
  const body = url.searchParams.get("body") ?? "";
  for (const part of ["Ce qui s'est passé", "Ce qui était attendu", "Étapes pour reproduire", "1.4.0", "Chrome/1", "badges", "Listes actives : 2"]) {
    assert.ok(body.includes(part), part);
  }
});
