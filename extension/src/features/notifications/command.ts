// Service worker : raccourci clavier d'annulation. La notification vit 5 secondes
// en fin de page x.com, trop loin pour la tabulation : le raccourci l'atteint sans
// lui donner le focus.
import { UNDO_LAST, type Message } from "../../core/messages.ts";
import { X_MATCHES } from "../networks/networks.ts";

/** Nom déclaré dans la clé `commands` du manifest. */
export const UNDO_COMMAND = "undo-last-block";

async function undoInActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, url: X_MATCHES });
  if (tab?.id !== undefined) await chrome.tabs.sendMessage(tab.id, { type: UNDO_LAST } satisfies Message);
}

export function serveCommands(): void {
  chrome.commands.onCommand.addListener((command) => {
    // Un onglet sans script vivant ne répond pas : rien à annuler.
    if (command === UNDO_COMMAND) undoInActiveTab().catch((err: unknown) => console.warn("[Barrage]", err));
  });
}
