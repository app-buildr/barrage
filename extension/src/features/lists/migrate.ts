// Migration depuis une version antérieure à la 1.4.0 : la clé `handles` devient
// « Ma liste perso » et l'accueil n'est pas montré. Les badges sont rattrapés
// juste après, voir syncAllBadges.
import { readStorage, stringArray } from "../../core/state.ts";
import { isNewer } from "../updates/version.ts";
import { officialList, readLists, withManualHandles } from "./lists.ts";

const LISTS_VERSION = "1.4.0";

/** Clé de résultat, écrite seulement une fois une liste en place : jamais avant l'accueil de la 1.4.0. */
const RESULT_KEY_RE = /^(?:acct:\d+\/)?result:/;

/**
 * Décidée sur les données, à chaque démarrage : un événement onInstalled manqué
 * ou une écriture échouée se rattrapent au démarrage suivant. `previousVersion`
 * ne sert qu'à reconnaître une ancienne installation sans rien de stocké.
 *
 * Idempotente, et rien n'est retiré avant d'être écrit : un arrêt en cours de
 * route ne perd aucun compte.
 */
export async function migrate(previousVersion?: string): Promise<void> {
  // Cas courant, à chaque réveil du service worker : sans lire tout le stockage.
  const { onboarded, handles } = await chrome.storage.local.get(["onboarded", "handles"]);
  const upgraded = previousVersion !== undefined && isNewer(LISTS_VERSION, previousVersion);
  if (onboarded === true && !Array.isArray(handles)) return;

  const stored = await readStorage();
  const old = upgraded || Array.isArray(handles) || Object.keys(stored).some((key) => RESULT_KEY_RE.test(key));
  if (!old) return;

  const at = Date.now();
  // Listes déjà là (accueil terminé, migration interrompue) : seule `handles` reste à reprendre.
  const lists = Array.isArray(stored.lists) ? readLists(stored.lists) : [officialList(true, ["x"], at)];
  await chrome.storage.local.set({
    lists: withManualHandles(lists, stringArray(handles), at),
    onboarded: true,
    ...(stored.notifyBadges === undefined ? { notifyBadges: true } : {}),
  });
  await chrome.storage.local.remove("handles");
}
