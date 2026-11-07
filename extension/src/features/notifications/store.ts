import type { State } from "../../core/state.ts";

/** Réglages des notifications, communs à tous les comptes X. */
export async function setNotifications(values: Partial<Pick<State, "notify" | "notifyBadges">>): Promise<void> {
  await chrome.storage.local.set(values);
}
