// Pastille de l'icône de l'extension, par priorité : en rouge, le nombre de
// comptes retirés des listes qui attendent un choix (le clic sur l'icône ouvre
// alors l'onglet Comptes, voir features/onboarding/open.ts), puis « ! » quand
// une mise à jour est disponible ; sinon le nombre de comptes en attente de blocage.
import { QUEUE_KEYS, getState, onStateChange } from "../../core/state.ts";
import { updateAvailable } from "../updates/version.ts";
import { pendingIn, queueOrder } from "./queue.ts";

// Le service worker n'a pas de CSS : valeurs recopiées de ui/palette.css
// (--color-coral-deep) et ui/globals.css (--color-state-problem).
const CORAL_DEEP = "#B83A14";
const RED = "#D7261E";
const WHITE = "#ffffff";

export async function refreshBadge(): Promise<void> {
  const state = await getState();
  const title = chrome.runtime.getManifest().action?.default_title ?? "";
  await chrome.action.setBadgeTextColor({ color: WHITE });
  if (state.retired.length) {
    const count = state.retired.length;
    await chrome.action.setBadgeBackgroundColor({ color: RED });
    await chrome.action.setBadgeText({ text: count > 999 ? "999+" : String(count) });
    await chrome.action.setTitle({
      title: `${title} (${count > 1 ? `${count} comptes retirés des listes` : "1 compte retiré des listes"}, à vérifier)`,
    });
    return;
  }
  if (updateAvailable(state.latestVersion)) {
    await chrome.action.setBadgeBackgroundColor({ color: RED });
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setTitle({ title: `${title} (mise à jour disponible)` });
    return;
  }
  // Seuls les comptes vus dans le fil ou demandés à la main sont en file.
  const pending = pendingIn(queueOrder(state), state.results).length;
  await chrome.action.setBadgeBackgroundColor({ color: CORAL_DEEP });
  await chrome.action.setBadgeText({ text: pending > 999 ? "999+" : pending ? String(pending) : "" });
  await chrome.action.setTitle({ title });
}

export function watchActionBadge(): void {
  // La version publiée et les comptes retirés ne font pas partie de la file :
  // écoutés à part, pour ne pas réveiller le traitement des onglets x.com.
  onStateChange(() => void refreshBadge(), [...QUEUE_KEYS, "latestVersion", "retired"]);
  chrome.runtime.onInstalled.addListener(() => void refreshBadge());
  chrome.runtime.onStartup.addListener(() => void refreshBadge());
}
