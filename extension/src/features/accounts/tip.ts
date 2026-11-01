// Encart info de la liste X : affiché jusqu'à ce que l'utilisateur le ferme,
// fermeture mémorisée dans chrome.storage.local.
import { part } from "../../ui/dom.ts";

const DISMISSED_KEY = "tipDismissed";

export function mountTip(root: HTMLElement): void {
  const tip = part(root, "tip");
  void chrome.storage.local.get({ [DISMISSED_KEY]: false }).then((stored) => {
    tip.hidden = stored[DISMISSED_KEY] === true;
  });
  part(root, "tip-close").addEventListener("click", () => {
    tip.hidden = true;
    void chrome.storage.local.set({ [DISMISSED_KEY]: true });
  });
}
