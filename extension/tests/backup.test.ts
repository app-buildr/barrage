import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { getState, resultKey } from "../src/core/state.ts";
import {
  BACKUP_INVALID,
  BACKUP_OTHER_ACCOUNT,
  backupFileName,
  checkBackup,
  createBackup,
  describeBackup,
} from "../src/features/backup/backup.ts";
import { restoreBackup } from "../src/features/backup/store.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { installChrome } from "./helpers/chrome.ts";

let store: Record<string, unknown>;

const list = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  source: "file",
  handles: ["a"],
  active: true,
  networks: ["x"],
  addedAt: 1,
  ...extra,
});

const full = (): Record<string, unknown> => ({
  lists: [officialList(true), list("manual", { source: "manual", handles: ["perso"] })],
  onboarded: true,
  disabled: ["off"],
  notify: false,
  notifyBadges: true,
  account: "2",
  legacy: "1",
  accounts: { "1": { handle: "premier" }, "2": {} },
  blockCount: 12,
  badges: { "1": 5, "10": 6 },
  badgeNotified: 10,
  "acct:2/blockCount": 1,
  [resultKey("a")]: { state: "blocked", at: 1 },
  [resultKey("b", "acct:2/")]: { state: "already_blocked", at: 2 },
  // Rien de ce qui suit n'entre dans une sauvegarde.
  remote: ["z"],
  bundled: ["z"],
  listGuards: { official: { baseline: ["z"], baselineAt: 1 } },
  latestVersion: "9.9.9",
  seen: ["a"],
  unblock: ["a"],
  retired: ["a"],
  retiredAt: { a: 1 },
  audit: ["a"],
  pauseUntil: 99,
  strikes: 2,
  failures: ["a"],
  error: { message: "m", reason: "auth", staleAt: 1 },
  "acct:2/seen": ["a"],
  "acct:2/error": null,
});

const backup = (stored = full()) => JSON.parse(JSON.stringify(createBackup(stored, "1.4.0", 1000)));

beforeEach(() => {
  store = {};
  installChrome(() => store);
});

test("une sauvegarde garde ce que X ne peut pas rendre, et aucune file ni pause", () => {
  const { data, version, exportedAt } = backup();
  assert.equal(version, "1.4.0");
  assert.equal(exportedAt, 1000);
  assert.deepEqual(Object.keys(data).sort(), [
    "account",
    "accounts",
    "acct:2/blockCount",
    "acct:2/result:b",
    "badgeNotified",
    "badges",
    "blockCount",
    "disabled",
    "legacy",
    "lists",
    "notify",
    "notifyBadges",
    "onboarded",
    "result:a",
  ]);
});

test("restaurer sur une installation vide rend l'état, résultats et préfixes compris, sans file", async () => {
  assert.deepEqual(await restoreBackup(backup()), { ok: true });
  const first = await getState("1");
  const second = await getState("2");
  assert.equal(first.results.a?.state, "blocked");
  assert.equal(second.results.b?.state, "already_blocked");
  assert.equal(first.blockCount, 12);
  assert.deepEqual(first.disabled, ["off"]);
  assert.equal(first.notify, false);
  assert.equal(first.onboarded, true);
  assert.deepEqual(first.seen, []);
  assert.deepEqual(first.audit, []);
  assert.deepEqual(first.unblock, []);
  assert.equal(first.pauseUntil, 0);
  assert.equal(first.lists.find((l) => l.id === "manual")?.handles[0], "perso");
});

test("restaurer deux fois revient au même", async () => {
  await restoreBackup(backup());
  const once = structuredClone(store);
  await restoreBackup(backup());
  assert.deepEqual(store, once);
});

test("restaurer n'efface rien : ce qui est connu ici reste", async () => {
  store = {
    legacy: "1",
    account: "1",
    lists: [officialList(false), list("autre")],
    disabled: ["ici"],
    blockCount: 50,
    badges: { "1": 2 },
    "result:a": { state: "unblocked", at: 9 },
    "result:ici": { state: "blocked", at: 9 },
    onboarded: true,
  };
  await restoreBackup(backup());
  const state = await getState("1");
  assert.equal(state.account, "1");
  assert.equal(state.results.a?.state, "unblocked");
  assert.equal(state.results.ici?.state, "blocked");
  assert.deepEqual(state.disabled, ["ici", "off"]);
  assert.equal(state.blockCount, 50);
  assert.deepEqual({ ...state.badges }, { "1": 2, "10": 6 });
  assert.deepEqual(state.lists.map((l) => l.id), ["official", "manual", "autre"]);
  assert.equal(state.lists[0]?.active, true);
});

test("une sauvegarde d'un autre premier compte X est refusée, sans rien écrire", async () => {
  store = { legacy: "7", "result:x": { state: "blocked", at: 1 } };
  const before = structuredClone(store);
  assert.deepEqual(await restoreBackup(backup()), { ok: false, reason: BACKUP_OTHER_ACCOUNT });
  assert.deepEqual(store, before);
});

test("un fichier qui n'est pas une sauvegarde est refusé", async () => {
  for (const value of [null, [], "x", {}, { app: "autre", format: 1, data: {} }, { app: "barrage", format: 1, data: [] }]) {
    assert.deepEqual(checkBackup(value), { ok: false, reason: BACKUP_INVALID });
    assert.equal((await restoreBackup(value)).ok, false);
  }
  assert.equal(checkBackup({ app: "barrage", format: 2, data: { notify: true } }).ok, false);
  assert.equal(checkBackup({ app: "barrage", format: 1, data: { inconnu: 1 } }).ok, false);
  assert.deepEqual(store, {});
});

test("seules les clés connues et les valeurs valides passent", () => {
  const check = checkBackup({
    app: "barrage",
    format: 1,
    data: {
      // Valides.
      notify: true,
      disabled: ["@Alice", "pas valide!", 3, "alice"],
      "result:bon": { state: "blocked", at: 1 },
      // Refusées.
      remote: ["pirate"],
      seen: ["pirate"],
      unblock: ["pirate"],
      "acct:2/unblock": ["pirate"],
      "acct:x/result:a": { state: "blocked", at: 1 },
      "result:pas valide": { state: "blocked", at: 1 },
      "result:etat": { state: "autre", at: 1 },
      "result:date": { state: "blocked", at: "hier" },
      legacy: "pas un nombre",
      blockCount: -1,
      badges: { "1": "hier" },
    },
  });
  assert.ok(check.ok);
  assert.deepEqual(check.data, {
    notify: true,
    disabled: ["alice"],
    "result:bon": { state: "blocked", at: 1 },
  });
  assert.equal(check.ignored, 11);
  assert.equal(describeBackup(check), "0 liste, 1 résultat, 0 compte X, 11 entrées ignorées.");
});

test("les listes sont relues : comptes normalisés, adresses revérifiées", () => {
  const check = checkBackup({
    app: "barrage",
    format: 1,
    data: {
      lists: [
        list("ok", { handles: ["@Bob", "pas valide!"] }),
        list("web", { source: "github", url: "https://evil.example/l.txt" }),
        list("sans", { source: "github" }),
        list("gh", { source: "github", url: "https://raw.githubusercontent.com/a/b/main/l.txt" }),
        { id: 3 },
      ],
    },
  });
  assert.ok(check.ok);
  const lists = check.data.lists as Array<{ id: string; handles: string[] }>;
  assert.deepEqual(lists.map((l) => l.id), ["official", "ok", "gh"]);
  assert.deepEqual(lists.find((l) => l.id === "ok")?.handles, ["bob"]);
});

test("le nom du fichier porte la date", () => {
  assert.equal(backupFileName(Date.UTC(2026, 10, 7)), "barrage-sauvegarde-2026-11-07.json");
});
