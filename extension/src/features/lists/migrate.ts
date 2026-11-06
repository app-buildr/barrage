// Migration depuis une version antérieure à la 1.4.0 : la clé `handles` devient
// « Ma liste perso » et l'accueil n'est pas montré. Les badges sont rattrapés
// juste après, voir syncAllBadges.
import { readStorage, strings } from "../../core/state.ts";
import { isNewer } from "../updates/version.ts";
import { manualList, officialList, type ListDef } from "./lists.ts";

const LISTS_VERSION = "1.4.0";

/** Idempotente : une fois `onboarded` enregistré, elle ne change plus rien. */
export async function migrate(previousVersion: string | undefined): Promise<void> {
  if (!previousVersion || !isNewer(LISTS_VERSION, previousVersion)) return;
  const stored = await readStorage();
  if (stored.onboarded === true) return;

  const at = Date.now();
  const handles = strings(stored.handles);
  const lists: ListDef[] = [officialList(true, ["x"], at)];
  if (handles.length) lists.push(manualList(handles, at));
  await chrome.storage.local.set({ lists, onboarded: true, notifyBadges: true });
  await chrome.storage.local.remove("handles");
}
