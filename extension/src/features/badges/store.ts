// Écritures des badges, appliquées une à la fois par le service worker.
import { accountStates, getState, readStorage, scoped, type State } from "../../core/state.ts";
import { blockedCount } from "../blocking/queue.ts";
import { awardBadges } from "./badges.ts";

/**
 * Blocage réussi par Barrage : le compteur du compte X progresse et les
 * paliers atteints sont attribués. Il n'est jamais décrémenté.
 */
export async function recordBlockSuccess(account?: string | null): Promise<void> {
  const { blockCount, badges, prefix } = await getState(account);
  const count = blockCount + 1;
  await chrome.storage.local.set(scoped(prefix, { blockCount: count, badges: awardBadges(count, badges, Date.now()) }));
}

/** Rattrape le compteur sur les comptes bloqués sur X, y compris avant Barrage : ce qui change, à écrire. */
function caughtUp({ blockCount, badges, prefix, results }: State, at: number): Record<string, unknown> {
  const count = Math.max(blockCount, blockedCount(results));
  const earned = awardBadges(count, badges, at);
  if (count === blockCount && Object.keys(earned).length === Object.keys(badges).length) return {};
  return scoped(prefix, { blockCount: count, badges: earned });
}

async function saveBadges(values: Record<string, unknown>): Promise<void> {
  if (Object.keys(values).length) await chrome.storage.local.set(values);
}

/** Comptes reconnus comme bloqués sur X : les badges suivent. */
export async function syncBadges(account?: string | null): Promise<void> {
  await saveBadges(caughtUp(await getState(account), Date.now()));
}

/** Installation ou mise à jour : les badges de chaque compte X sont rattrapés. */
export async function syncAllBadges(): Promise<void> {
  const at = Date.now();
  await saveBadges(Object.assign({}, ...accountStates(await readStorage()).map((state) => caughtUp(state, at))));
}

/** Notification de badge fermée ou partagée : ce palier et les inférieurs ne reviennent plus. */
export async function dismissBadge(palier: number, account?: string | null): Promise<void> {
  const { badgeNotified, prefix } = await getState(account);
  await chrome.storage.local.set(scoped(prefix, { badgeNotified: Math.max(badgeNotified, palier) }));
}
