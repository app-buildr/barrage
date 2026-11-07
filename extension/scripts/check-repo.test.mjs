// Lance scripts/check-repo.mjs sur un faux dépôt : une copie des vrais fichiers
// dans un dossier temporaire, avec son propre git. Les fichiers du dépôt ne sont
// jamais modifiés.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { LIST_GUARD_FLOOR, LIST_MAX_ADDED_SHARE, LIST_MAX_SIZE } from "../src/core/config.ts";

const SCRIPT = fileURLToPath(new URL("./check-repo.mjs", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));
const NETWORKS = ["x", "instagram", "tiktok", "youtube", "facebook"];
const DIST = [
  "manifest.json", "background.js", "content.js", "content.css", "options.html",
  "icons/icon16.png", "icons/icon48.png", "icons/icon128.png",
];

const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const handles = (count) => Array.from({ length: count }, (_, i) => `compte_${String(i).padStart(4, "0")}`);
const writeList = (root, network, value) =>
  writeFileSync(join(root, `lists/${network}.json`), typeof value === "string" ? value : JSON.stringify(value));

/** Faux dépôt : `x` est la liste de la base, commitée sur le tag `base`. */
function fixture(x = handles(100)) {
  const root = mkdtempSync(join(tmpdir(), "barrage-check-"));
  roots.push(root);
  mkdirSync(join(root, "lists"));
  mkdirSync(join(root, "extension/dist/icons"), { recursive: true });
  for (const network of NETWORKS) writeList(root, network, network === "x" ? x : []);
  for (const file of ["package.json", "manifest.json"]) cpSync(join(REPO, "extension", file), join(root, "extension", file));
  for (const file of DIST) writeFileSync(join(root, "extension/dist", file), "");
  const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("add", "lists");
  git("commit", "-qm", "base");
  git("tag", "base");
  return root;
}

function check(root, ...args) {
  const run = spawnSync("node", [SCRIPT, `--root=${root}`, "--base=base", ...args], { encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

function assertRefused(root, pattern, ...args) {
  const { status, output } = check(root, ...args);
  assert.equal(status, 1, output);
  assert.match(output, pattern);
}

const editJson = (path, edit) => writeFileSync(path, JSON.stringify(edit(JSON.parse(readFileSync(path, "utf8")))));

test("accepte le vrai lists/x.json et des listes vides pour les autres réseaux", () => {
  const root = fixture(JSON.parse(readFileSync(join(REPO, "lists/x.json"), "utf8")));
  const { status, output } = check(root);
  assert.equal(status, 0, output);
  assert.match(output, /0 retirés, 0 ajoutés/);
});

test("accepte les entrées valides de chaque réseau", () => {
  const root = fixture();
  writeList(root, "instagram", ["a.b_c"]);
  writeList(root, "tiktok", ["a.b"]);
  writeList(root, "facebook", ["nom.page"]);
  writeList(root, "youtube", ["@nom-1", `UC${"aB".repeat(11)}`]);
  const { status, output } = check(root);
  assert.equal(status, 0, output);
});

test("refuse un fichier qui n'est pas un tableau de chaînes", () => {
  const root = fixture();
  writeList(root, "x", "[\"compte_0000\",");
  assertRefused(root, /x\.json : illisible/);
  writeList(root, "x", { handles: [] });
  assertRefused(root, /x\.json : le fichier n'est pas un tableau/);
  writeList(root, "x", ["compte_0000", 42]);
  assertRefused(root, /x\.json : toutes les entrées doivent être des chaînes/);
});

test("refuse une entrée X non normalisée, avec son @ ou trop longue", () => {
  for (const entry of ["Majuscule", "@arobase", "https://x.com/nom", "seize_caracteres", "espace "]) {
    const root = fixture();
    writeList(root, "x", [...handles(100), entry].sort());
    assertRefused(root, /x\.json : 1 entrées invalides/);
  }
});

test("refuse un doublon et un tri non respecté", () => {
  const root = fixture();
  const list = handles(100);
  writeList(root, "x", [list[0], ...list]);
  assertRefused(root, /x\.json : 1 doublons \(compte_0000\)/);
  writeList(root, "x", [...list].reverse());
  assertRefused(root, /x\.json : tri non respecté/);
});

test("refuse une liste X vide ou au-delà de LIST_MAX_SIZE", () => {
  const root = fixture();
  writeList(root, "x", []);
  assertRefused(root, /x\.json : refusée par l'extension \(liste vide\)/);
  writeList(root, "x", handles(LIST_MAX_SIZE + 1));
  assertRefused(root, new RegExp(`x\\.json : plus de ${LIST_MAX_SIZE} comptes`));
});

test("applique les règles des autres réseaux", () => {
  const cases = { instagram: ["a b"], tiktok: ["a"], facebook: ["abcd"], youtube: ["nom", "UCcourt"] };
  for (const [network, entries] of Object.entries(cases)) {
    const root = fixture();
    writeList(root, network, entries);
    assertRefused(root, new RegExp(`${network}\\.json : ${entries.length} entrées invalides`));
  }
});

test("refuse un fichier de liste sans réseau connu", () => {
  const root = fixture();
  writeList(root, "mastodon", []);
  assertRefused(root, /sans réseau connu \(mastodon\.json\)/);
});

test("laisse passer un retrait massif : l'extension demande l'accord de chaque utilisateur", () => {
  const root = fixture();
  writeList(root, "x", handles(40));
  const { status, output } = check(root);
  assert.equal(status, 0, output);
  assert.match(output, /60 retirés, 0 ajoutés sur 100/);
});

test("compare les ajouts à la base avec le seuil de l'extension", () => {
  const root = fixture();
  const atMost = 100 + 100 * LIST_MAX_ADDED_SHARE;
  writeList(root, "x", handles(atMost));
  const atLimit = check(root);
  assert.equal(atLimit.status, 0, atLimit.output);
  writeList(root, "x", handles(atMost + 1));
  assertRefused(root, /x\.json : refusée par l'extension \(\d+ comptes ajoutés d'un coup à 100\)/);
});

test("laisse passer un ajout sous le plancher, même gros en proportion", () => {
  const root = fixture(handles(4));
  writeList(root, "x", handles(4 + LIST_GUARD_FLOOR));
  const { status, output } = check(root);
  assert.equal(status, 0, output);
});

test("compte les ajouts et les retraits d'une liste qui change", () => {
  const root = fixture();
  writeList(root, "x", [...handles(100).slice(1), "zz_nouveau"]);
  const { status, output } = check(root);
  assert.equal(status, 0, output);
  assert.match(output, /1 retirés, 1 ajoutés sur 100/);
});

test("échoue si la référence de base n'existe pas, et ne saute pas la comparaison", () => {
  const root = fixture();
  assertRefused(root, /référence git introuvable : inconnue/, "--base=inconnue");
});

test("laisse réparer une liste cassée sur la base", () => {
  const root = fixture("pas du json");
  writeList(root, "x", handles(100));
  const { status, output } = check(root);
  assert.equal(status, 0, output);
  assert.match(output, /illisible sur base/);
});

test("refuse des versions différentes et un tag qui ne correspond pas", () => {
  const root = fixture();
  const version = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8")).version;
  assert.equal(check(root, `--tag=v${version}`).status, 0);
  assertRefused(root, /version : tag v0\.0\.1/, "--tag=v0.0.1");
  editJson(join(root, "extension/package.json"), (pkg) => ({ ...pkg, version: "0.0.1" }));
  assertRefused(root, /version : 0\.0\.1 dans package\.json/);
});

test("refuse des motifs d'hôtes différents de X_MATCHES", () => {
  const root = fixture();
  const path = join(root, "extension/manifest.json");
  editJson(path, (manifest) => ({ ...manifest, host_permissions: ["https://x.com/*"] }));
  assertRefused(root, /host_permissions diffère de X_MATCHES/);
  cpSync(join(REPO, "extension/manifest.json"), path);
  editJson(path, (manifest) => ({ ...manifest, content_scripts: [{ ...manifest.content_scripts[0], matches: [] }] }));
  assertRefused(root, /content_scripts\.matches diffère de X_MATCHES/);
});

test("refuse un dist/ auquel il manque un fichier du manifest", () => {
  for (const file of DIST) {
    const root = fixture();
    rmSync(join(root, "extension/dist", file));
    assertRefused(root, new RegExp(`fichiers du manifest absents \\(${file.replace(".", "\\.")}\\)`));
  }
});
