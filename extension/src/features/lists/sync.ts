// Service worker : télécharge la liste collaborative et les listes GitHub
// importées, et répond aux options. Le calendrier (démarrage, alarme) et ce qui
// est relevé en même temps se décident dans entries/background.ts.
// Une liste qui s'écarte trop de sa référence attend une confirmation dans les
// options, voir compareLists.
import { LIST_MAX_BYTES, LISTS_RECHECK_MS, LISTS_REFRESH_MINUTES, LISTS_URL } from "../../core/config.ts";
import {
  fromOptions,
  isImportListRequest,
  isRefreshListsRequest,
  type ImportListReply,
  type RefreshListsReply,
} from "../../core/messages.ts";
import { DOWNLOAD_ERROR, analyzeList, validateListUrl } from "./import.ts";
import { OFFICIAL_ID, readListSync, readLists } from "./lists.ts";
import { parseList } from "./remote.ts";
import { receiveOfficial, recordListRefusal, updateListHandles } from "./store.ts";
import { serial } from "../../core/writer.ts";

const ALARM = "barrage-lists";

/** Téléchargement manqué : la liste en place reste. Seul le cas hors ligne ne mérite pas de trace. */
function warnDownload(url: string, err: unknown): void {
  if (navigator.onLine !== false) console.warn("[Barrage] téléchargement refusé :", url, err);
}

/**
 * Contenu texte d'une liste GitHub. Sans suivre de redirection : la requête ne
 * doit jamais quitter les hôtes acceptés. Lève une erreur si la réponse n'est pas lisible.
 */
async function fetchListText(url: string): Promise<string> {
  // no-cache : toujours revalidé auprès de GitHub, sans retélécharger un fichier inchangé (ETag).
  const response = await fetch(url, { cache: "no-cache", credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // Même règle qu'un fichier local, en octets. L'en-tête évite de tout télécharger pour rien.
  if (Number(response.headers.get("content-length")) > LIST_MAX_BYTES) throw new Error("fichier trop gros");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > LIST_MAX_BYTES) throw new Error("fichier trop gros");
  return new TextDecoder().decode(bytes);
}

async function refreshOfficial(): Promise<void> {
  if (!LISTS_URL) return;
  const url = `${LISTS_URL}/x.json`;
  let body: unknown;
  try {
    body = JSON.parse(await fetchListText(url));
  } catch (err) {
    warnDownload(url, err);
    return;
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

/** Listes GitHub importées, désactivées comprises : à jour à leur réactivation. */
async function refreshImported(): Promise<void> {
  const stored = await chrome.storage.local.get({ lists: [] });
  await Promise.all(
    readLists(stored.lists).map(async (list) => {
      if (list.source !== "github") return;
      const { id } = list;
      const checked = validateListUrl(list.url);
      if (!checked.ok) return;
      let report;
      try {
        report = analyzeList(await fetchListText(checked.url));
      } catch (err) {
        warnDownload(checked.url, err);
        return;
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
  } catch (err) {
    warnDownload(checked.url, err);
    return { ok: false, reason: DOWNLOAD_ERROR };
  }
}

/** Toutes les listes en ligne. */
export const refreshLists = (): Promise<unknown> => Promise.all([refreshOfficial(), refreshImported()]);

/** La collaborative vient d'être vérifiée : rouvrir les options ne relance rien. */
async function checkedRecently(): Promise<boolean> {
  const { listSync } = await chrome.storage.local.get({ listSync: null });
  return Date.now() - (readListSync(listSync)[OFFICIAL_ID] ?? 0) < LISTS_RECHECK_MS;
}

/**
 * Écoute l'alarme et les messages des options.
 * @param refresh rafraîchissement complet, composé par entries/background.ts
 * @returns à appeler pour planifier l'alarme et rafraîchir une première fois
 */
export function syncLists(refresh: () => Promise<unknown>): () => void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void refresh();
  });
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (reply: RefreshListsReply) => void) => {
    if (!isRefreshListsRequest(message) || !fromOptions(sender)) return false;
    void checkedRecently()
      .then((recent) => (recent ? undefined : refresh()))
      .catch((err: unknown) => console.warn("[Barrage]", err))
      .finally(() => sendResponse(true));
    return true; // réponse asynchrone
  });
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (reply: ImportListReply) => void) => {
    if (!isImportListRequest(message) || !fromOptions(sender)) return false;
    void importList(message.url).then(sendResponse);
    return true; // réponse asynchrone
  });
  return () => {
    void chrome.alarms.create(ALARM, { periodInMinutes: LISTS_REFRESH_MINUTES });
    void refresh();
  };
}
