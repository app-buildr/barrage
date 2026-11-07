import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { getState } from "../src/core/state.ts";
import { diffSummary } from "../src/core/format.ts";
import { hasListUpdate, listUpdate, offListHandles } from "../src/features/blocking/queue.ts";
import { DELETED_LIST, updateChoice, updateGroups } from "../src/features/accounts/list-update.ts";
import { OFFICIAL_NAME, officialList } from "../src/features/lists/lists.ts";
import { installChrome } from "./helpers/chrome.ts";
import { listDef, putResults, result } from "./helpers/fixtures.ts";

let store: Record<string, unknown>;

beforeEach(() => {
  store = {
    remote: ["n", "a2"],
    lists: [officialList(true), listDef("g", [], { name: "Nouvelle liste perso" })],
    onboarded: true,
    retired: ["a", "moi", "b", "c", "parti"],
    retiredFrom: { b: "g", c: "supprimee" },
    added: ["n"],
    addedFrom: {},
  };
  putResults(store, { a: result("blocked"), b: result("blocked"), moi: result("already_blocked"), parti: result("unblocked") });
  installChrome(() => store);
});

const rows = (lines: Array<{ handle: string; from: string; status: { label: string } }>) =>
  lines.map((l) => [l.handle, l.from, l.status.label]);

test("trois groupes : retirés bloqués par Barrage, retirés pas encore bloqués, ajoutés", async () => {
  const groups = updateGroups(await getState());
  assert.deepEqual(rows(groups.blocked), [
    ["a", OFFICIAL_NAME, "Bloqué"],
    ["b", "Nouvelle liste perso", "Bloqué"],
  ]);
  assert.deepEqual(rows(groups.notBlocked), [
    ["c", DELETED_LIST, "Visible"],
    ["parti", OFFICIAL_NAME, "Visible"],
  ]);
  assert.deepEqual(rows(groups.added), [["n", OFFICIAL_NAME, "Visible"]]);
});

test("un compte bloqué par l'utilisateur avant Barrage n'est pas présenté, mais reste hors liste", async () => {
  const state = await getState();
  assert.deepEqual(listUpdate(state), { retired: ["a", "b", "c", "parti"], actionable: ["a", "b"], added: ["n"] });
  assert.ok(offListHandles(state).includes("moi"));
  assert.ok(!offListHandles(state).includes("a"));
});

test("l'état d'un compte est celui du tableau : un compte sur Off s'affiche désactivé", async () => {
  store.disabled = ["c", "n"];
  const groups = updateGroups(await getState());
  assert.equal(groups.notBlocked[0]?.status.label, "Désactivé");
  assert.equal(groups.added[0]?.status.label, "Désactivé");
});

test("la date affichée est celle du changement présenté le plus récent", async () => {
  store.retiredAt = { a: 5, moi: 50 };
  store.addedAt = { n: 12 };
  assert.equal(updateGroups(await getState()).at, 12);
  store.addedAt = {};
  assert.equal(updateGroups(await getState()).at, 5);
  store.retiredAt = {};
  assert.equal(updateGroups(await getState()).at, null);
});

test("la recommandation suit la mise à jour : débloquer ce que Barrage a bloqué, ne plus bloquer le reste", async () => {
  assert.deepEqual(updateChoice(updateGroups(await getState())), { unblock: ["a", "b"], keep: ["c", "parti"], follow: [] });
});

test("un compte coché est gardé : bloqué il le reste, pas encore bloqué il rejoint « Ma liste perso »", async () => {
  assert.deepEqual(updateChoice(updateGroups(await getState()), new Set(["b", "c", "inconnu"])), {
    unblock: ["a"],
    keep: ["b", "parti"],
    follow: ["c"],
  });
});

test("une mise à jour est à voir tant qu'un compte présenté reste", async () => {
  assert.equal(hasListUpdate(await getState()), true);
  store.retired = ["moi"];
  store.added = [];
  assert.equal(hasListUpdate(await getState()), false);
});

test("le résumé dit les retraits et les ajouts", () => {
  assert.equal(diffSummary(574, 12), "574 comptes retirés, 12 ajoutés");
  assert.equal(diffSummary(0, 3), "3 comptes ajoutés");
  assert.equal(diffSummary(1, 0), "1 compte retiré");
});
