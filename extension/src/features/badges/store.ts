// Écritures des badges, appliquées une à la fois par le service worker.
import { accountStates, getState, readStorage, scoped } from "../../core/state.ts";
import { awardBadges } from "./badges.ts";

/**
 * Blocage réussi par Barrage : le compteur du compte X progresse et les
 * paliers atteints sont attribués. Il n'est jamais décrémenté.
 */
export async function recordBlockSuccess(account?: string | null): Promise<void> {
  const { blockCount, badges, badgeQueue, notifyBadges, prefix } = await getState(account);
  const count = blockCount + 1;
  const award = awardBadges(count, badges, badgeQueue, notifyBadges, Date.now());
  await chrome.storage.local.set(scoped(prefix, { blockCount: count, ...award }));
}

/** Notification de badge fermée ou partagée : le palier quitte la file. */
export async function dismissBadge(palier: number, account?: string | null): Promise<void> {
  const { badgeQueue, prefix } = await getState(account);
  await chrome.storage.local.set(scoped(prefix, { badgeQueue: badgeQueue.filter((p) => p !== palier) }));
}

/** Réglage des notifications de badge. Le couper vide la file de chaque compte X. */
export async function setNotifyBadges(notifyBadges: boolean): Promise<void> {
  const values: Record<string, unknown> = { notifyBadges };
  if (!notifyBadges) {
    for (const { prefix } of accountStates(await readStorage())) Object.assign(values, scoped(prefix, { badgeQueue: [] }));
  }
  await chrome.storage.local.set(values);
}
