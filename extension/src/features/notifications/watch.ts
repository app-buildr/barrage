// Notifications « @user vient d'être bloqué », « @user a été débloqué » et
// « nouveau badge » sur x.com. Chaque onglet X surveille le stockage : le
// blocage a pu être fait par un autre onglet, et c'est dans celui que
// l'utilisateur regarde que la notification doit paraître.
import { contextAlive } from "../../core/context.ts";
import { OPEN_BADGES, type Message } from "../../core/messages.ts";
import { getState, onStateChange } from "../../core/state.ts";
import { write } from "../../core/write.ts";
import { pendingBadge } from "../badges/badges.ts";
import { accountId } from "../blocking/api.ts";
import { createAnnouncer } from "./announce.ts";
import { mountToaster } from "./mount.tsx";
import { createBadgeStore, createToastStore, type Content } from "./toasts.ts";

const toasts = createToastStore();
const badges = createBadgeStore();

/** Pile dessinée à la première notification seulement : rien dans la page avant. */
let host: HTMLElement | null = null;

function ensureHost(): void {
  if (!host) host = mountToaster(toasts, badges, dismissBadge, openBadges);
  // Retirée par x.com ou une autre extension : on la remet, avec son état.
  else if (!host.isConnected) document.body.append(host);
}

function show(handle: string, content: Content): void {
  ensureHost();
  toasts.show(handle, content);
}

const announce = createAnnouncer(show);

/** Fermée ou partagée : elle ne revient plus, voir pendingBadge. */
function dismissBadge(palier: number): void {
  badges.set(null);
  // Extension rechargée : cet onglet orphelin ne peut plus écrire, le badge reviendra.
  if (contextAlive()) void write("dismissBadge", palier, accountId());
}

function openBadges(): void {
  if (contextAlive()) void chrome.runtime.sendMessage({ type: OPEN_BADGES } satisfies Message);
}

/** Badge à notifier du compte X connecté, dans l'onglet visible. */
async function showBadge(): Promise<void> {
  const account = accountId();
  if (!contextAlive() || !account || document.visibilityState !== "visible") return;
  const { badges: earned, badgeNotified, notifyBadges } = await getState(account);
  const palier = notifyBadges ? pendingBadge(earned, badgeNotified) : null;
  if (palier !== null) ensureHost();
  badges.set(palier);
}

export function watchBlocks(): void {
  // Onglet caché : ses animations s'arrêtent, le décompte aussi. Une
  // notification laissée là réapparaîtrait au retour, périmée : on les retire.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      toasts.clear();
      badges.set(null);
    } else void showBadge();
  });
  onStateChange((changes) => {
    // Inutile de dessiner dans un onglet que personne ne regarde.
    if (document.visibilityState !== "visible") return;
    void announce(changes);
  }, ["results"]);
  onStateChange(() => void showBadge(), ["badges", "badgeNotified", "notifyBadges", "account"]);
  void showBadge();
}
