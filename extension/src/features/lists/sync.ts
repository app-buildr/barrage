// Service worker : télécharge la liste collaborative et les listes GitHub
// importées au démarrage, toutes les 6 heures et à chaque ouverture des
// options, et compare la liste intégrée à chaque mise à jour de l'extension.
// Un compte retiré de la liste collaborative que Barrage avait bloqué est mis
// en file de déblocage, pour chaque compte X où il l'avait bloqué ; l'onglet
// x.com qui traite la file s'en charge. Un compte retiré d'une liste GitHub
// reste bloqué. La dernière version publiée de l'extension est relevée en même temps.
import { LIST_MAX_BYTES, LISTS_REFRESH_MINUTES, LISTS_URL } from "../../core/config.ts";
import { isImportListRequest, isRefreshListsRequest, type ImportListReply } from "../../core/messages.ts";
import { accountStates, readStorage, scoped, strings, type State } from "../../core/state.ts";
import { DEFAULT_HANDLES } from "./defaults.ts";
import { blockedByBarrage } from "../blocking/queue.ts";
import { DOWNLOAD_ERROR, analyzeList, validateListUrl } from "./import.ts";
import { OFFICIAL_ID, otherActiveHandles, readLists } from "./lists.ts";
import { compareLists, parseList } from "./remote.ts";
import { updateListHandles } from "./store.ts";
import { serial } from "../../core/writer.ts";
import { checkLatestVersion } from "../updates/check.ts";

const ALARM = "barrage-lists";
/** Liste intégrée à la version précédente de l'extension. */
const BUNDLED_KEY = "bundled";

/**
 * Remplace la liste collaborative `current` par `next` : les comptes retirés que
 * Barrage a bloqués passent en file de déblocage, sur chaque compte X où il
 * les a bloqués. Renvoie false si la nouvelle liste est refusée.
 * @param states état de chaque compte X, voir accountStates : la liste et les
 *   réglages, communs, se lisent sur n'importe lequel
 */
async function replaceList(
  states: readonly State[],
  current: readonly string[],
  next: readonly string[],
  extra: Record<string, unknown>,
): Promise<boolean> {
  const shared = states[0] as State;
  const update = compareLists(current, next, otherActiveHandles(shared.lists, "x"));
  if (!update.ok) {
    console.warn("[Barrage] liste collaborative ignorée :", update.reason);
    return false;
  }
  const removed = new Set(update.removed);
  const listed = new Set(next);
  const values: Record<string, unknown> = {
    ...extra,
    // Un compte sorti de la liste quitte aussi les réglages qui le visaient.
    disabled: shared.disabled.filter((h) => !removed.has(h)),
  };
  for (const own of states) {
    Object.assign(
      values,
      scoped(own.prefix, {
        // Un déblocage demandé à la main reste dû, voir unblockQueue.
        // Un compte remis dans la liste entre-temps n'est plus à débloquer, même si
        // la liste est désactivée plus tard.
        retired: [...new Set([...own.retired, ...blockedByBarrage(update.removed, own.results)])].filter(
          (h) => !listed.has(h),
        ),
        seen: own.seen.filter((h) => !removed.has(h)),
      }),
    );
  }
  await chrome.storage.local.set(values);
  return true;
}

/**
 * Mise à jour de l'extension : tant qu'aucune liste n'est reçue de GitHub, la
 * liste intégrée fait foi, un compte qu'elle ne contient plus est retiré comme
 * il le serait de la liste en ligne.
 */
async function syncBundled(): Promise<void> {
  const stored = await readStorage();
  const previous = Array.isArray(stored[BUNDLED_KEY]) ? strings(stored[BUNDLED_KEY]) : null;
  const bundled = { [BUNDLED_KEY]: [...DEFAULT_HANDLES] };
  const states = accountStates(stored);
  if (previous && states[0]?.remote === null && (await replaceList(states, previous, DEFAULT_HANDLES, bundled))) return;
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
  if (!parsed.ok) {
    console.warn("[Barrage] liste collaborative ignorée :", parsed.reason);
    return;
  }
  await serial(async () => {
    const states = accountStates(await readStorage());
    const syncedAt = Date.now();
    const lists = (states[0] as State).lists.map((l) => (l.id === OFFICIAL_ID ? { ...l, syncedAt } : l));
    await replaceList(states, states[0]?.remote ?? DEFAULT_HANDLES, parsed.handles, { remote: parsed.handles, lists });
  });
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
      if (!report.ok) return console.warn("[Barrage] liste ignorée :", report.reason);
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
