// Service worker : télécharge la liste collaborative et les listes GitHub
// importées au démarrage, toutes les 6 heures et à chaque ouverture des
// options, et compare la liste intégrée à chaque mise à jour de l'extension.
// Un compte retiré de la liste collaborative que Barrage avait bloqué est mis
// en file de déblocage, pour chaque compte X où il l'avait bloqué ; l'onglet
// x.com qui traite la file s'en charge, passé RETIRE_GRACE_MS. Un compte retiré
// d'une liste GitHub reste bloqué. Une liste qui s'écarte trop de sa référence
// attend une confirmation dans les options, voir compareLists. La dernière version publiée de l'extension est relevée en même temps.
import { LIST_MAX_BYTES, LISTS_REFRESH_MINUTES, LISTS_URL } from "../../core/config.ts";
import { isImportListRequest, isRefreshListsRequest, type ImportListReply } from "../../core/messages.ts";
import { accountStates, readStorage, stringArray, type State } from "../../core/state.ts";
import { DEFAULT_HANDLES } from "./defaults.ts";
import { DOWNLOAD_ERROR, analyzeList, validateListUrl } from "./import.ts";
import { OFFICIAL_ID, otherActiveHandles, readLists } from "./lists.ts";
import { compareLists, parseList } from "./remote.ts";
import { receiveOfficial, recordListRefusal, replaceOfficial, updateListHandles } from "./store.ts";
import { serial } from "../../core/writer.ts";
import { checkLatestVersion } from "../updates/check.ts";

const ALARM = "barrage-lists";
/** Liste intégrée à la version précédente de l'extension. */
const BUNDLED_KEY = "bundled";

/**
 * Mise à jour de l'extension : tant qu'aucune liste n'est reçue de GitHub, la
 * liste intégrée fait foi, un compte qu'elle ne contient plus est retiré comme
 * il le serait de la liste en ligne.
 */
async function syncBundled(): Promise<void> {
  const stored = await readStorage();
  const previous = Array.isArray(stored[BUNDLED_KEY]) ? stringArray(stored[BUNDLED_KEY]) : null;
  const bundled = { [BUNDLED_KEY]: [...DEFAULT_HANDLES] };
  const states = accountStates(stored);
  const shared = states[0] as State;
  if (previous && shared.remote === null) {
    const update = compareLists(previous, DEFAULT_HANDLES, otherActiveHandles(shared.lists, "x"));
    if (update.ok) return replaceOfficial(states, DEFAULT_HANDLES, update, bundled);
    console.warn("[Barrage] liste intégrée sans retrait :", update.reason);
  }
  await chrome.storage.local.set(bundled);
}

async function refreshList(): Promise<void> {
  if (!LISTS_URL) return;
  let body: unknown;
  try {
    // no-store : GitHub met déjà le fichier en cache quelques minutes.
    const response = await fetch(`${LISTS_URL}/x.json`, { cache: "no-store" });
    if (!response.ok) return;
    body = await response.json();
  } catch {
    return; // Hors ligne ou fichier illisible : la liste en place reste.
  }

  const parsed = parseList(body);
  const at = Date.now();
  if (!parsed.ok) {
    console.warn("[Barrage] liste collaborative ignorée :", parsed.reason);
    await serial(() => recordListRefusal(OFFICIAL_ID, parsed.reason, at));
    return;
  }
  await serial(() => receiveOfficial(parsed.handles, at));
}

/**
 * Contenu texte d'une liste GitHub. Sans suivre de redirection : la requête ne
 * doit jamais quitter les hôtes acceptés. Lève une erreur si la réponse n'est pas lisible.
 */
async function fetchListText(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // Même règle qu'un fichier local, en octets. L'en-tête évite de tout télécharger pour rien.
  if (Number(response.headers.get("content-length")) > LIST_MAX_BYTES) throw new Error("fichier trop gros");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > LIST_MAX_BYTES) throw new Error("fichier trop gros");
  return new TextDecoder().decode(bytes);
}

/** Listes GitHub importées, désactivées comprises : à jour à leur réactivation. */
async function refreshImported(): Promise<void> {
  const stored = await chrome.storage.local.get({ lists: [] });
  await Promise.all(
    readLists(stored.lists).map(async ({ id, url }) => {
      const checked = url ? validateListUrl(url) : null;
      if (!checked?.ok) return;
      let report;
      try {
        report = analyzeList(await fetchListText(checked.url));
      } catch {
        return; // Hors ligne ou fichier illisible : la liste en place reste.
      }
      if (!report.ok) {
        console.warn("[Barrage] liste ignorée :", report.reason);
        const { reason } = report;
        await serial(() => recordListRefusal(id, reason, Date.now()));
        return;
      }
      const { handles } = report;
      await serial(() => updateListHandles(id, handles, Date.now()));
    }),
  );
}

/** Options : télécharge et analyse une liste, sans rien enregistrer. */
async function importList(raw: string): Promise<ImportListReply> {
  const checked = validateListUrl(raw);
  if (!checked.ok) return checked;
  try {
    const report = analyzeList(await fetchListText(checked.url));
    return report.ok ? { ...report, url: checked.url } : report;
  } catch {
    return { ok: false, reason: DOWNLOAD_ERROR };
  }
}

/** Listes en ligne et dernière version de l'extension, relevées ensemble. */
const refresh = () => Promise.all([refreshList(), refreshImported(), checkLatestVersion()]);

export function syncLists(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void refresh();
  });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (reply: boolean) => void) => {
    if (!isRefreshListsRequest(message)) return false;
    void refresh().finally(() => sendResponse(true));
    return true; // réponse asynchrone
  });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (reply: ImportListReply) => void) => {
    if (!isImportListRequest(message)) return false;
    void importList(message.url).then(sendResponse);
    return true; // réponse asynchrone
  });
  const schedule = () => {
    void chrome.alarms.create(ALARM, { periodInMinutes: LISTS_REFRESH_MINUTES });
    void refresh();
  };
  chrome.runtime.onInstalled.addListener(() => void serial(syncBundled).finally(schedule));
  chrome.runtime.onStartup.addListener(schedule);
}
