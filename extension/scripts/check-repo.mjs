// Contrôle du dépôt, lancé par la CI après le build : listes de lists/, versions,
// motifs d'hôtes et fichiers du manifest dans dist/. Les seuils et les règles de X
// sont ceux de l'extension, importés de src/ : ce qui passe ici passe chez les
// utilisateurs. Usage, depuis extension/ :
//   node scripts/check-repo.mjs                compare les listes à origin/main
//   node scripts/check-repo.mjs --base=<réf>   compare à une autre référence git
//   node scripts/check-repo.mjs --tag=v1.4.0   vérifie aussi le tag d'une release
//   node scripts/check-repo.mjs --root=<dir>   contrôle un autre dossier (tests)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import * as config from "../src/core/config.ts";
import { parseHandle } from "../src/features/lists/handles.ts";
import { compareLists, parseList } from "../src/features/lists/remote.ts";
import { NETWORKS, X_MATCHES } from "../src/features/networks/networks.ts";

const { values: args } = parseArgs({
  options: {
    base: { type: "string", default: "origin/main" },
    root: { type: "string", default: fileURLToPath(new URL("../..", import.meta.url)) },
    tag: { type: "string" },
  },
});

/** Forme d'une entrée, par réseau. Voir lists/README.md. */
const ENTRY_RULES = {
  x: (entry) => parseHandle(entry) === entry,
  instagram: (entry) => /^[a-z0-9_.]{1,30}$/.test(entry),
  tiktok: (entry) => /^[a-z0-9_.]{2,24}$/.test(entry),
  facebook: (entry) => /^[a-z0-9.]{5,50}$/.test(entry),
  // Identifiant de chaîne (sensible à la casse) ou @nom.
  youtube: (entry) => /^UC[A-Za-z0-9_-]{22}$/.test(entry) || /^@[a-z0-9_.-]{3,30}$/.test(entry),
};
/** Le seul réseau dont l'extension lit la liste : celle-ci ne peut pas être vide. */
const READ_BY_EXTENSION = "x";

const errors = [];
const notes = [];
const sample = (entries) => entries.slice(0, 5).join(", ") + (entries.length > 5 ? "…" : "");

/** Contenu d'un fichier de liste, ou null s'il est illisible (erreur enregistrée). */
function readList(network) {
  const file = `lists/${network}.json`;
  let body;
  try {
    body = JSON.parse(readFileSync(`${args.root}/${file}`, "utf8"));
  } catch (error) {
    errors.push(`${file} : illisible (${error.message})`);
    return null;
  }
  if (!Array.isArray(body)) {
    errors.push(`${file} : le fichier n'est pas un tableau`);
    return null;
  }
  if (body.some((entry) => typeof entry !== "string")) {
    errors.push(`${file} : toutes les entrées doivent être des chaînes`);
    return null;
  }
  return body;
}

function checkEntries(network, list) {
  const file = `lists/${network}.json`;
  const invalid = list.filter((entry) => !ENTRY_RULES[network](entry));
  if (invalid.length) errors.push(`${file} : ${invalid.length} entrées invalides (${sample(invalid)})`);
  const duplicates = list.filter((entry, i) => list.indexOf(entry) !== i);
  if (duplicates.length) errors.push(`${file} : ${duplicates.length} doublons (${sample(duplicates)})`);
  const unsorted = list.filter((entry, i) => i > 0 && list[i - 1] > entry);
  if (unsorted.length) errors.push(`${file} : tri non respecté, à partir de « ${unsorted[0]} »`);
  if (list.length > config.LIST_MAX_SIZE) errors.push(`${file} : plus de ${config.LIST_MAX_SIZE} comptes`);
  if (network === READ_BY_EXTENSION) {
    const parsed = parseList(list);
    if (!parsed.ok) errors.push(`${file} : refusée par l'extension (${parsed.reason})`);
  }
}

/** Liste du réseau à la référence de base, ou null si elle n'y existe pas ou n'y est pas exploitable. */
function baseList(network) {
  let text;
  try {
    const options = { cwd: args.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
    text = execFileSync("git", ["show", `${args.base}:lists/${network}.json`], options);
  } catch {
    notes.push(`lists/${network}.json : absent de ${args.base}, pas de comparaison`);
    return null;
  }
  try {
    const body = JSON.parse(text);
    if (Array.isArray(body)) return body;
  } catch {
    // Traité plus bas : une liste cassée sur la base ne doit pas empêcher de la réparer.
  }
  notes.push(`lists/${network}.json : illisible sur ${args.base}, pas de comparaison`);
  return null;
}

/** Mêmes gardes que l'extension à la réception : une liste qu'elle refuserait n'est pas publiée. */
function compareWithBase(network, list) {
  const file = `lists/${network}.json`;
  const base = baseList(network);
  if (!base) return;
  const update = compareLists(base, list, []);
  if (!update.ok) errors.push(`${file} : refusée par l'extension (${update.reason})`);
  const known = new Set(base);
  const added = list.filter((entry) => !known.has(entry)).length;
  const removed = base.length - (list.length - added);
  if (base.length || list.length) notes.push(`${file} : ${removed} retirés, ${added} ajoutés sur ${base.length} (${args.base})`);
}

function checkLists() {
  const networks = NETWORKS.map((network) => network.id);
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${args.base}^{commit}`], { cwd: args.root, stdio: "ignore" });
  } catch {
    errors.push(`référence git introuvable : ${args.base}, comparaison des listes impossible`);
  }
  const unknown = readdirSync(`${args.root}/lists`).filter(
    (file) => file.endsWith(".json") && !networks.includes(file.replace(/\.json$/, "")),
  );
  if (unknown.length) errors.push(`lists/ : fichier sans réseau connu (${sample(unknown)})`);
  for (const network of networks) {
    const list = readList(network);
    if (!list) continue;
    checkEntries(network, list);
    if (!errors.some((error) => error.startsWith("référence git"))) compareWithBase(network, list);
  }
}

function checkManifest() {
  const dir = `${args.root}/extension`;
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
  if (pkg.version !== manifest.version) {
    errors.push(`version : ${pkg.version} dans package.json, ${manifest.version} dans manifest.json`);
  }
  if (args.tag !== undefined && args.tag !== `v${manifest.version}`) {
    errors.push(`version : tag ${args.tag}, manifest en ${manifest.version}`);
  }
  if (!isDeepStrictEqual(manifest.host_permissions, X_MATCHES)) {
    errors.push("manifest.json : host_permissions diffère de X_MATCHES (features/networks/networks.ts)");
  }
  if (manifest.content_scripts.some((script) => !isDeepStrictEqual(script.matches, X_MATCHES))) {
    errors.push("manifest.json : content_scripts.matches diffère de X_MATCHES (features/networks/networks.ts)");
  }
  const declared = [
    "manifest.json",
    manifest.background.service_worker,
    ...manifest.content_scripts.flatMap((script) => [...(script.js ?? []), ...(script.css ?? [])]),
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  const missing = [...new Set(declared)].filter((file) => !existsSync(`${dir}/dist/${file}`));
  if (missing.length) errors.push(`dist/ : fichiers du manifest absents (${sample(missing)}), lancer npm run build`);
}

checkLists();
checkManifest();

for (const note of notes) console.log(note);
if (errors.length) {
  console.error(`\n${errors.length} erreur(s) :`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
console.log("Contrôle du dépôt : OK.");
