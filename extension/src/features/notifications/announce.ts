// Ce qu'un changement de résultats annonce sur x.com, sans DOM : watch.ts fournit
// l'affichage. Testé dans tests/announce.test.ts.
import { prefixFor, resultChanges, type StateChanges } from "../../core/state.ts";
import { write } from "../../core/write.ts";
import { accountId } from "../blocking/api.ts";
import { newlyBlocked, newlyUnblocked } from "../blocking/queue.ts";
import { CONFIRM_MS, type Content } from "./toasts.ts";

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

/** @param show affiche une notification, ou met à jour celle de ce compte */
export function createAnnouncer(show: (handle: string, content: Content) => void) {
  /**
   * Comptes dont le blocage vient d'être annulé dans cet onglet : la
   * notification a déjà confirmé l'annulation, le déblocage effectif (quelques
   * secondes plus tard, au tour suivant de la file) n'en affiche pas d'autre.
   */
  const cancelled = new Set<string>();

  /** Seuls les blocages du compte X connecté sont annoncés. */
  return async function announce(changes: StateChanges): Promise<void> {
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
          write("setEnabled", handle, false).catch((err: unknown) => console.warn("[Barrage]", err));
          show(handle, CANCELLED);
        },
      });
    }
    // Tout déblocage coupe le blocage automatique du compte. Après « Annuler »,
    // la notification l'a déjà confirmé : pas de seconde notification.
    for (const handle of unblocked) {
      if (!cancelled.delete(handle)) show(handle, UNBLOCKED);
    }
  };
}
