// Migration depuis une version antérieure à la 1.4.0 : la clé `handles` devient
// « Ma liste perso », l'accueil n'est pas montré, et les blocages déjà faits
// comptent pour les badges.
import { accountStates, readStorage, scoped, strings } from "../../core/state.ts";
import { awardBadges } from "../badges/badges.ts";
import { blockedByBarrage } from "../blocking/queue.ts";
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
  const values: Record<string, unknown> = { lists, onboarded: true, notifyBadges: true };
  for (const { results, prefix } of accountStates(stored)) {
    const blockCount = blockedByBarrage(Object.keys(results), results).length;
    const { badges, badgeQueue } = awardBadges(blockCount, Object.create(null), [], true, at);
    Object.assign(values, scoped(prefix, { blockCount, badges, badgeQueue }));
  }
  await chrome.storage.local.set(values);
  await chrome.storage.local.remove("handles");
}
