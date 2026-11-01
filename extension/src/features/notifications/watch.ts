// Notifications « @user vient d'être bloqué » et « @user a été débloqué » sur x.com. Chaque onglet X
// surveille les résultats : le blocage a pu être fait par un autre onglet, et
// c'est dans celui que l'utilisateur regarde que la notification doit paraître.
import { onStateChange, prefixFor, resultChanges, type StateChanges } from "../../core/state.ts";
import { write } from "../../core/write.ts";
import { accountId } from "../blocking/api.ts";
import { newlyBlocked, newlyUnblocked } from "../blocking/queue.ts";
import { mountToaster } from "./mount.tsx";
import { CONFIRM_MS, createToastStore, type Content } from "./toasts.ts";

const toasts = createToastStore();

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
let mounted = false;

function show(handle: string, content: Content): void {
  if (!mounted) {
    mountToaster(toasts);
    mounted = true;
  }
  toasts.show(handle, content);
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
    if (document.visibilityState === "hidden") toasts.clear();
  });
  onStateChange((changes) => {
    // Inutile de dessiner dans un onglet que personne ne regarde.
    if (document.visibilityState !== "visible") return;
    void announce(changes);
  }, ["results"]);
}
