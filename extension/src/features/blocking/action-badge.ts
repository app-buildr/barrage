// Pastille de l'icône de l'extension, par priorité :
// - en rouge, le nombre de comptes d'une mise à jour de liste (retirés et
//   ajoutés) quand un compte retiré bloqué par Barrage attend une décision ;
// - « ! » rouge quand une mise à jour de l'extension est disponible ;
// - en vert, ce même nombre quand la mise à jour n'appelle aucun déblocage ;
// - sinon, le nombre de comptes en attente de blocage.
// Tant qu'une mise à jour des listes est à voir, le clic sur l'icône ouvre
// l'onglet Comptes, voir features/onboarding/open.ts.
import { QUEUE_KEYS, getState, onStateChange } from "../../core/state.ts";
import { diffSummary } from "../../core/format.ts";
import { updateAvailable } from "../updates/version.ts";
import { listUpdate, pendingIn, queueOrder } from "./queue.ts";

// Le service worker n'a pas de CSS : valeurs recopiées de ui/palette.css
// (--color-coral-deep, --color-connected-ink) et ui/globals.css (--color-state-problem).
const CORAL_DEEP = "#B83A14";
const RED = "#D7261E";
const GREEN = "#16704A";
const WHITE = "#ffffff";

const short = (count: number): string => (count > 999 ? "999+" : String(count));

async function show(text: string, color: string, title: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title });
}

export async function refreshBadge(): Promise<void> {
  const state = await getState();
  const title = chrome.runtime.getManifest().action?.default_title ?? "";
  await chrome.action.setBadgeTextColor({ color: WHITE });
  const update = listUpdate(state);
  const changes = update.retired.length + update.added.length;
  const label = `${title} (mise à jour des listes : ${diffSummary(update.retired.length, update.added.length)}`;
  if (update.actionable.length) return show(short(changes), RED, `${label}, à vérifier)`);
  if (updateAvailable(state.latestVersion)) return show("!", RED, `${title} (mise à jour disponible)`);
  if (changes) return show(short(changes), GREEN, `${label})`);
  // Seuls les comptes vus dans le fil ou demandés à la main sont en file.
  const pending = pendingIn(queueOrder(state), state.results).length;
  await show(pending ? short(pending) : "", CORAL_DEEP, title);
}

export function watchActionBadge(): void {
  // La version publiée et la mise à jour des listes ne font pas partie de la
  // file : écoutées à part, pour ne pas réveiller le traitement des onglets x.com.
  onStateChange(() => void refreshBadge(), [...QUEUE_KEYS, "latestVersion", "retired", "added"]);
  chrome.runtime.onInstalled.addListener(() => void refreshBadge());
  chrome.runtime.onStartup.addListener(() => void refreshBadge());
}
