import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { installChrome } from "./helpers/chrome.ts";
import { getState, offListHandles, queueOrder, resultKey, unblockQueue } from "../src/core/state.ts";
import { addHandles } from "../src/features/accounts/store.ts";
import { accountLines, lineCounts } from "../src/features/accounts/lines.ts";
import { listDetails } from "../src/features/lists/details.ts";
import { analyzeList, checkListFile, describeReport, looksLikeProse, looksLikeTable, validateListUrl, BAD_HOST_MESSAGE, INVALID_WARNING, PROSE_WARNING, TABLE_MESSAGE } from "../src/features/lists/import.ts";
import { cleanName, effectiveHandles, officialList, readLists, uniqueName, type ListDef } from "../src/features/lists/lists.ts";
import { migrate } from "../src/features/lists/migrate.ts";
import { pendingBadge } from "../src/features/badges/badges.ts";
import { syncAllBadges } from "../src/features/badges/store.ts";
import {
  addList,
  completeOnboarding,
  removeList,
  renameList,
  setListActive,
  setListNetworks,
  updateListHandles,
} from "../src/features/lists/store.ts";

let store: Record<string, unknown>;

const list = (id: string, handles: string[], extra: Partial<ListDef> = {}): ListDef => ({
  id,
  name: id,
  source: "file",
  handles,
  active: true,
  networks: ["x"],
  addedAt: 0,
  ...extra,
});

beforeEach(() => {
  store = { remote: ["a", "b"], lists: [officialList(true)], onboarded: true };
  installChrome(() => store);
});

// Liste effective

test("la liste effective est l'union sans doublon des listes actives du réseau", () => {
  const lists = [officialList(true), list("l1", ["b", "c"]), list("off", ["d"], { active: false }), list("rien", ["e"], { networks: [] })];
  assert.deepEqual(effectiveHandles(lists, "x", ["a", "b"]), ["a", "b", "c"]);
});

test("des listes enregistrées corrompues sont écartées, la collaborative reste", () => {
  const lists = readLists([{ id: 1 }, null, list("l1", ["a"], { networks: ["x", "myspace" as never] })]);
  assert.deepEqual(lists.map((l) => l.id), ["official", "l1"]);
  assert.deepEqual(lists[1]?.networks, ["x"]);
});

// Activation et suppression

test("désactiver une liste ne débloque rien : ses comptes passent hors liste", async () => {
  store.lists = [officialList(true), list("l1", ["c"])];
  store.seen = ["c"];
  store[resultKey("c")] = { state: "blocked", at: 1 };
  await setListActive("l1", false);
  const state = await getState();
  assert.deepEqual(unblockQueue(state), []);
  assert.deepEqual(offListHandles(state), ["c"]);
  assert.deepEqual(state.seen, []);
  assert.deepEqual(queueOrder(state), []);
});

test("un compte couvert par une autre liste active reste dans la liste effective", async () => {
  store.lists = [officialList(true), list("l1", ["a", "c"])];
  await setListActive("l1", false);
  assert.deepEqual((await getState()).handles, ["a", "b"]);
});

test("un compte retiré de la collaborative n'est pas hors liste : il va être débloqué", async () => {
  store.retired = ["c"];
  store.retiredAt = { c: 1 };
  store[resultKey("c")] = { state: "blocked", at: 1 };
  const state = await getState();
  assert.deepEqual(offListHandles(state), []);
  assert.deepEqual(unblockQueue(state), ["c"]);
});

test("un compte déjà bloqué ou débloqué sort ou reste du tableau selon son résultat", async () => {
  store[resultKey("c")] = { state: "already_blocked", at: 1 };
  store[resultKey("d")] = { state: "unblocked", at: 1 };
  store[resultKey("e")] = { state: "not_found", at: 1 };
  assert.deepEqual(offListHandles(await getState()), ["c"]);
});

test("activer une liste met ses comptes sans résultat à vérifier, pour chaque compte X", async () => {
  store.legacy = "1";
  store.accounts = { "1": {}, "2": {} };
  store.lists = [officialList(true), list("l1", ["c", "d", "e"], { active: false })];
  store.disabled = ["e"];
  store[resultKey("c")] = { state: "blocked", at: 1 };
  await setListActive("l1", true);
  assert.deepEqual(store.audit, ["d"]);
  assert.deepEqual(store["acct:2/audit"], ["c", "d"]);
});

test("une liste garde au moins un réseau, conservé à sa désactivation", async () => {
  store.lists = [officialList(true), list("l1", ["c"])];
  await assert.rejects(setListNetworks("l1", []));
  await setListActive("l1", false);
  assert.deepEqual((await getState()).lists[1]?.networks, ["x"]);
});

test("seule une liste désactivée et non collaborative se supprime", async () => {
  store.lists = [officialList(false), list("l1", ["c"]), list("l2", ["d"], { active: false })];
  await assert.rejects(removeList("official"));
  await assert.rejects(removeList("l1"));
  store[resultKey("d")] = { state: "blocked", at: 1 };
  await removeList("l2");
  const state = await getState();
  assert.deepEqual(state.lists.map((l) => l.id), ["official", "l1"]);
  assert.deepEqual(unblockQueue(state), []);
  assert.deepEqual(store[resultKey("d")], { state: "blocked", at: 1 });
});

// Noms

test("les noms pris sont numérotés à la manière du Finder, premier numéro libre", () => {
  assert.equal(uniqueName("Liste", []), "Liste");
  assert.equal(uniqueName("Liste", ["Liste"]), "Liste (1)");
  assert.equal(uniqueName("Liste", ["Liste", "Liste (1)", "Liste (3)"]), "Liste (2)");
  assert.equal(uniqueName("x".repeat(40), ["x".repeat(40)]).length, 40);
});

test("une liste importée s'appelle toujours « Nouvelle liste perso », numérotée", async () => {
  await addList({ source: "file", handles: ["c"], networks: ["x"] });
  await addList({ source: "github", url: "https://raw.githubusercontent.com/a/b/main/l.txt", handles: ["d"], networks: ["x"] });
  const [, first, second] = (await getState()).lists;
  assert.equal(first?.name, "Nouvelle liste perso");
  assert.equal(second?.name, "Nouvelle liste perso (1)");
  assert.equal(first?.active, true);
  assert.equal(second?.source, "github");
  assert.ok(second?.syncedAt);
});

test("renommer : espaces retirés, vide refusé, collaborative refusée, nom pris numéroté", async () => {
  store.lists = [officialList(true), list("l1", []), list("l2", [], { name: "Amis" })];
  await renameList("l1", "  Amis ");
  assert.equal((await getState()).lists[1]?.name, "Amis (1)");
  await assert.rejects(renameList("l1", "   "));
  await assert.rejects(renameList("l1", "x".repeat(41)));
  await assert.rejects(renameList("official", "Autre"));
  await renameList("l2", "Amis");
  assert.equal((await getState()).lists[2]?.name, "Amis");
  assert.equal(cleanName(" a "), "a");
});

// Ajout à la main

test("l'ajout à la main crée « Ma liste perso », active, au premier ajout", async () => {
  await addHandles(["c"]);
  const manual = (await getState()).lists.find((l) => l.id === "manual");
  assert.deepEqual([manual?.name, manual?.handles, manual?.active], ["Ma liste perso", ["c"], true]);
});

test("l'ajout dans une « Ma liste perso » désactivée est enregistré et signalé", async () => {
  store.lists = [officialList(true), list("manual", ["c"], { source: "manual", active: false })];
  assert.deepEqual(await addHandles(["c", "d"]), { added: ["d"], existing: ["c"], inactive: true });
  const state = await getState();
  assert.deepEqual(state.lists[1]?.handles, ["c", "d"]);
  assert.ok(!state.handles.includes("d"));
});

test("l'ajout dans une « Ma liste perso » qui ne couvre pas X est signalé aussi", async () => {
  store.lists = [officialList(true), list("manual", [], { source: "manual", networks: [] })];
  assert.equal((await addHandles(["c"])).inactive, true);
});

// Tableau des comptes

test("le tableau suit la liste effective, puis les comptes hors liste", async () => {
  store[resultKey("a")] = { state: "blocked", at: 1 };
  store[resultKey("hors")] = { state: "blocked", at: 1 };
  const lines = accountLines(await getState());
  assert.deepEqual(lines.map((l) => [l.handle, l.offList]), [["a", false], ["b", false], ["hors", true]]);
  const { all, listed } = lineCounts(lines);
  assert.equal(all.blocked, 2);
  assert.equal(listed.blocked, 1);
  assert.equal(listed.visible, 1);
});

test("un compte hors liste débloqué à la main reste affiché jusqu'au déblocage", async () => {
  store[resultKey("hors")] = { state: "blocked", at: 1 };
  store.disabled = ["hors"];
  store.unblock = ["hors"];
  assert.equal(accountLines(await getState()).at(-1)?.status.label, "Déblocage en cours…");
  store[resultKey("hors")] = { state: "unblocked", at: 2 };
  assert.deepEqual(accountLines(await getState()).map((l) => l.handle), ["a", "b"]);
});

// Synchronisation d'une liste GitHub

test("une liste GitHub qui retire des comptes les laisse bloqués, hors liste", async () => {
  store.lists = [officialList(true), list("g", ["c", "d", "e"], { source: "github" })];
  store[resultKey("c")] = { state: "blocked", at: 1 };
  assert.equal(await updateListHandles("g", ["d", "e"], 5), true);
  const state = await getState();
  assert.deepEqual(unblockQueue(state), []);
  assert.deepEqual(offListHandles(state), ["c"]);
  assert.equal(state.lists[1]?.syncedAt, 5);
});

test("une liste GitHub qui retire trop de comptes d'un coup est mise de côté", async () => {
  const handles = Array.from({ length: 20 }, (_, i) => `c${i}`);
  store.lists = [officialList(true), list("g", handles, { source: "github" })];
  assert.equal(await updateListHandles("g", ["c0"], 5), false);
  assert.deepEqual((await getState()).lists[1]?.handles, handles);
});

test("supprimer une liste oublie sa garde", async () => {
  store.lists = [officialList(true), list("g", ["a"], { source: "github", active: false })];
  store.listGuards = { g: { baseline: ["a"], baselineAt: 1 } };
  await removeList("g");
  assert.deepEqual(Object.keys((await getState()).listGuards), []);
});

// Adresses

test("seules les adresses https exactes de GitHub sont acceptées", () => {
  for (const ok of ["https://raw.githubusercontent.com/a/b/main/l.txt", " https://gist.githubusercontent.com/a/1/raw/l.csv "]) {
    assert.equal(validateListUrl(ok).ok, true);
  }
  for (const bad of [
    "http://raw.githubusercontent.com/a",
    "https://github.com/a/b/blob/main/l.txt",
    "https://raw.githubusercontent.com.evil.com/a",
    "https://evil.com/raw.githubusercontent.com/a",
    "https://raw.githubusercontent.com@evil.com/a",
    "https://user:pass@raw.githubusercontent.com/a",
    "https://raw.githubusercontent.com:8443/a",
    "javascript:alert(1)",
    "pas une adresse",
  ]) {
    assert.deepEqual(validateListUrl(bad), { ok: false, reason: BAD_HOST_MESSAGE }, bad);
  }
});

// Fichiers

test("un fichier est refusé par son extension ou sa taille", () => {
  assert.equal(checkListFile("liste.TXT", 10), null);
  assert.equal(checkListFile("liste.csv", 1_000_000), null);
  assert.match(checkListFile("liste.json", 10) ?? "", /\.txt et \.csv/);
  assert.match(checkListFile("liste.txt", 1_000_001) ?? "", /1 Mo/);
});

// Format d'import

test("l'analyse accepte tous les formats et rend compte des doublons et invalides", () => {
  const report = analyzeList("@Alice bob;carol,\nhttps://x.com/dave mobile.twitter.com/Erin alice x.com/home pas-valide!");
  assert.deepEqual(report, {
    ok: true,
    handles: ["alice", "bob", "carol", "dave", "erin"],
    duplicates: 1,
    invalid: ["x.com/home", "pas-valide!"],
    warning: INVALID_WARNING,
  });
  assert.ok(report.ok);
  assert.equal(describeReport(report), "5 comptes retenus, 1 doublon, 2 invalides.");
});

test("une liste vide ou trop longue est refusée", () => {
  assert.equal(analyzeList("!!! ???").ok, false);
  assert.equal(analyzeList(Array.from({ length: 5000 }, (_, i) => `c${i}`).join(" ")).ok, true);
  assert.equal(analyzeList(Array.from({ length: 5001 }, (_, i) => `c${i}`).join(" ")).ok, false);
});

test("un tableau à plusieurs colonnes est refusé : ses cellules ne sont pas des comptes", () => {
  const csv = 'id,nom,prenom,twitter\nPA1,David,Alain,\nPA2,Guedj,Jérôme,@JeromeGuedj\n';
  assert.deepEqual(analyzeList(csv), { ok: false, reason: TABLE_MESSAGE });
  assert.equal(looksLikeTable("a;b\nc;d\n"), true);
  assert.equal(looksLikeTable("a\tb\nc\td"), true);
});

test("une liste simple n'est pas prise pour un tableau", () => {
  assert.equal(looksLikeTable("alice\nbob\ncarol\n"), false);
  assert.equal(looksLikeTable("alice, bob, carol"), false);
  assert.equal(looksLikeTable("alice,\nbob,\ncarol,\n"), false);
  assert.equal(looksLikeTable("alice bob\ncarol dave"), false);
});

// Accueil

test("accueil : liste collaborative active sur les réseaux cochés", async () => {
  store = { legacy: "1", accounts: { "1": {} }, remote: ["a", "b"] };
  await completeOnboarding({ kind: "official", networks: ["x"] });
  const state = await getState();
  assert.equal(state.onboarded, true);
  assert.deepEqual(state.handles, ["a", "b"]);
  assert.deepEqual(state.audit, ["a", "b"]);
});

test("accueil : liste perso active, collaborative enregistrée désactivée", async () => {
  store = { remote: ["a", "b"] };
  await completeOnboarding({ kind: "list", list: { source: "file", handles: ["c"], networks: ["x"] } });
  const state = await getState();
  assert.deepEqual(state.handles, ["c"]);
  assert.equal(state.lists.find((l) => l.id === "official")?.active, false);
});

test("accueil : un second envoi ne change rien", async () => {
  store = { remote: ["a", "b"] };
  const choice = { kind: "list", list: { source: "file", handles: ["c"], networks: ["x"] } } as const;
  await completeOnboarding(choice);
  await completeOnboarding(choice);
  assert.equal((await getState()).lists.length, 2);
});

test("accueil : « plus tard » ne laisse aucune liste active", async () => {
  store = { remote: ["a", "b"] };
  await completeOnboarding({ kind: "later" });
  const state = await getState();
  assert.equal(state.onboarded, true);
  assert.deepEqual(state.handles, []);
});

// Détails affichés

test("les détails d'une liste suivent sa source", () => {
  const now = Date.UTC(2026, 10, 6, 12);
  assert.equal(listDetails(officialList(true), 1426, now), "1426 comptes · GitHub");
  assert.equal(listDetails({ ...officialList(true), syncedAt: now - 2 * 3_600_000 }, 1426, now), "1426 comptes · GitHub · mise à jour il y a 2 h");
  assert.equal(listDetails(list("f", [], { addedAt: Date.UTC(2026, 10, 3, 12) }), 1, now), "1 compte · fichier importé le 3 nov.");
  assert.equal(listDetails(list("m", [], { source: "manual" }), 1, now), "1 compte · ajouté à la main");
  assert.equal(listDetails(list("m", [], { source: "manual" }), 2, now), "2 comptes · ajoutés à la main");
});

// Migration

const seed = () => {
  store = {
    handles: ["perso"],
    remote: ["a", "b"],
    legacy: "1",
    accounts: { "1": {}, "2": {} },
    notify: false,
  };
  for (let i = 0; i < 12; i++) store[resultKey(`c${i}`)] = { state: "blocked", at: 1 };
  store[resultKey("deja")] = { state: "already_blocked", at: 1 };
  store[resultKey("x", "acct:2/")] = { state: "blocked", at: 1 };
};

test("la migration crée les listes et les badges de chaque compte X", async () => {
  seed();
  await migrate("1.3.0");
  await syncAllBadges();
  const state = await getState("1");
  assert.equal(state.onboarded, true);
  assert.equal(state.notify, false);
  assert.equal(state.notifyBadges, true);
  assert.equal("handles" in store, false);
  assert.deepEqual(state.lists.map((l) => [l.id, l.active, l.handles]), [
    ["official", true, []],
    ["manual", true, ["perso"]],
  ]);
  assert.deepEqual(state.handles, ["a", "b", "perso"]);
  assert.equal(state.blockCount, 13);
  assert.deepEqual(Object.keys(state.badges), ["1", "10"]);
  assert.equal(pendingBadge(state.badges, state.badgeNotified), 10);
  const second = await getState("2");
  assert.equal(second.blockCount, 1);
  assert.equal(pendingBadge(second.badges, second.badgeNotified), 1);
});

test("sans compte perso, la migration ne crée que la collaborative", async () => {
  store = { remote: ["a"] };
  await migrate("1.2.0");
  assert.deepEqual((await getState()).lists.map((l) => l.id), ["official"]);
});

test("la migration est idempotente", async () => {
  seed();
  await migrate("1.3.0");
  const after = structuredClone(store);
  store[resultKey("nouveau")] = { state: "blocked", at: 2 };
  delete after[resultKey("nouveau")];
  await migrate("1.3.0");
  delete store[resultKey("nouveau")];
  assert.deepEqual(store, after);
});

test("la migration ignore une version déjà à jour et une installation neuve", async () => {
  store = { handles: ["perso"] };
  await migrate("1.4.0");
  await migrate(undefined);
  assert.equal("lists" in store, false);
});

// Texte libre

test("des noms ou des phrases sont signalés, sans empêcher l'aperçu", () => {
  for (const text of ["Jean Dupont\nMarie Curie\nPaul Martin", "Bonjour je suis une phrase sans virgule\nEt une autre ici"]) {
    assert.equal(looksLikeProse(text), true);
    const report = analyzeList(text);
    assert.ok(report.ok && report.warning === PROSE_WARNING);
  }
});

test("une vraie liste n'est pas signalée", () => {
  for (const text of ["alice\nbob\ncarol", "@alice @bob\n@carol", "https://x.com/alice https://x.com/bob", "alice"]) {
    assert.equal(looksLikeProse(text), false);
    const report = analyzeList(text);
    assert.ok(report.ok && report.warning === undefined);
  }
});

test("une liste aux entrées largement invalides met en garde, un écart isolé non", () => {
  const good = Array.from({ length: 20 }, (_, i) => `c${i}`);
  const few = analyzeList([...good, "pas!valide"].join("\n"));
  assert.ok(few.ok && few.warning === undefined);
  const many = analyzeList([...good, "a!", "b!", "c!"].join("\n"));
  assert.ok(many.ok && many.warning === INVALID_WARNING);
});
