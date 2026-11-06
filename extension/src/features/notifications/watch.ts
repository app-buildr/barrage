// Notifications « @user vient d'être bloqué », « @user a été débloqué » et
// « nouveau badge » sur x.com. Chaque onglet X surveille le stockage : le
// blocage a pu être fait par un autre onglet, et c'est dans celui que
// l'utilisateur regarde que la notification doit paraître.
import { contextAlive } from "../../core/context.ts";
import { accountKey, onStateChange, prefixFor, resultChanges, type StateChanges } from "../../core/state.ts";
import { write } from "../../core/write.ts";
import { accountId } from "../blocking/api.ts";
import { newlyBlocked, newlyUnblocked } from "../blocking/queue.ts";
import { mountToaster } from "./mount.tsx";
import { CONFIRM_MS, createBadgeStore, createToastStore, type Content } from "./toasts.ts";

const toasts = createToastStore();
const badges = createBadgeStore();

/**
 * Comptes dont le blocage vient d'être annulé dans cet onglet : la
 * notification a déjà confirmé l'annulation, le déblocage effectif (quelques
 * secondes plus tard, au tour suivant de la file) n'en affiche pas d'autre.
 */
const cancelled = new Set<string>();

const BLOCKED: Omit<Content, "undo"> = { kind: "blocked", title: " vient d'être bloqué ! ✊", detail: "par Barrage" };
const UNBLOCKED: Content = {
  kind: "unblocked",
  title: " a été débloqué.",
  detail: "Barrage ne le bloquera plus automatiquement.",
};
/** Après « Annuler » : état final tout de suite, le déblocage suit dans la file. */
const CANCELLED: Content = {
  kind: "unblocked",
  title: " : blocage annulé.",
  detail: UNBLOCKED.detail,
  duration: CONFIRM_MS,
  pausable: false,
};

/** Pile dessinée à la première notification seulement : rien dans la page avant. */
let host: HTMLElement | null = null;

function ensureHost(): void {
  if (!host) host = mountToaster(toasts, badges, dismissBadge);
  // Retirée par x.com ou une autre extension : on la remet, avec son état.
  else if (!host.isConnected) document.body.append(host);
}

function show(handle: string, content: Content): void {
  ensureHost();
  toasts.show(handle, content);
}

/** Fermée ou partagée : le prochain palier en attente apparaît, voir showBadge. */
function dismissBadge(palier: number): void {
  badges.set(null);
  // Extension rechargée : cet onglet orphelin ne peut plus écrire, le badge reviendra.
  if (contextAlive()) void write("dismissBadge", palier, accountId());
}

/** Premier badge en attente du compte X connecté, dans l'onglet visible. */
async function showBadge(): Promise<void> {
  const account = accountId();
  if (!contextAlive() || !account || document.visibilityState !== "visible") return;
  const key = accountKey(await prefixFor(account), "badgeQueue");
  const queue = (await chrome.storage.local.get({ [key]: [] }))[key] as unknown;
  const palier = Array.isArray(queue) && typeof queue[0] === "number" ? queue[0] : null;
  if (palier !== null) ensureHost();
  badges.set(palier);
}

/** Seuls les blocages du compte X connecté sont annoncés. */
async function announce(changes: StateChanges): Promise<void> {
  const { before, after } = resultChanges(changes, await prefixFor(accountId()));
  const blocked = newlyBlocked(before, after);
  const unblocked = newlyUnblocked(before, after);
  if (!blocked.length && !unblocked.length) return;
  const { notify } = await chrome.storage.local.get({ notify: true });
  if (notify === false) return;
  // « Annuler » coupe le blocage automatique du compte, ce qui le débloque. La
  // même notification confirme l'annulation.
  for (const handle of blocked) {
    show(handle, {
      ...BLOCKED,
      undo: () => {
        cancelled.add(handle);
        void write("setEnabled", handle, false);
        show(handle, CANCELLED);
      },
    });
  }
  // Tout déblocage coupe le blocage automatique du compte. Après « Annuler »,
  // la notification l'a déjà confirmé : pas de seconde notification.
  for (const handle of unblocked) {
    if (!cancelled.delete(handle)) show(handle, UNBLOCKED);
  }
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
  onStateChange(() => void showBadge(), ["badgeQueue", "account"]);
  void showBadge();
}
