// Ce qu'un changement de résultats annonce sur x.com, sans DOM : watch.ts fournit
// l'affichage. Testé dans tests/announce.test.ts.
import { contextAlive } from "../../core/context.ts";
import { prefixFor, resultChanges, type StateChanges } from "../../core/state.ts";
import { write } from "../../core/write.ts";
import { accountId } from "../x/session.ts";
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

/** « Annuler » n'a pas pu s'écrire : le compte reste bloqué, et il faut le dire. */
const UNDO_FAILED: Content = {
  kind: "blocked",
  title: " : annulation impossible.",
  detail: "Le compte reste bloqué. Rechargez x.com, ou passez par les options de Barrage.",
  pausable: false,
};

/**
 * @param show affiche une notification, ou met à jour celle de ce compte
 * @param visible l'onglet est regardé : sinon rien n'est dessiné
 */
export function createAnnouncer(show: (handle: string, content: Content) => void, visible: () => boolean = () => true) {
  /**
   * Comptes dont le blocage vient d'être annulé dans cet onglet : la
   * notification a déjà confirmé l'annulation, le déblocage effectif (quelques
   * secondes plus tard, au tour suivant de la file) n'en affiche pas d'autre.
   */
  const cancelled = new Set<string>();

  /** Seuls les blocages du compte X connecté sont annoncés. */
  return async function announce(changes: StateChanges): Promise<void> {
    const shown = visible();
    if (!shown && !cancelled.size) return;
    const { before, after } = resultChanges(changes, await prefixFor(accountId()));
    const blocked = newlyBlocked(before, after);
    const unblocked = newlyUnblocked(before, after);
    if (!blocked.length && !unblocked.length) return;
    // Onglet caché : rien à dessiner, mais une annulation aboutie ne doit pas
    // avaler plus tard la notification d'un autre déblocage de ce compte.
    if (!shown) {
      for (const handle of unblocked) cancelled.delete(handle);
      return;
    }
    const { notify } = await chrome.storage.local.get({ notify: true });
    if (notify === false) return;
    // « Annuler » coupe le blocage automatique du compte, ce qui le débloque. La
    // même notification confirme l'annulation.
    for (const handle of blocked) {
      show(handle, {
        ...BLOCKED,
        undo: () => {
          // Extension rechargée : cet onglet orphelin ne peut plus écrire.
          if (!contextAlive()) return show(handle, UNDO_FAILED);
          cancelled.add(handle);
          write("setEnabled", handle, false).then(
            () => show(handle, CANCELLED),
            (err: unknown) => {
              console.warn("[Barrage]", err);
              cancelled.delete(handle);
              show(handle, UNDO_FAILED);
            },
          );
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
