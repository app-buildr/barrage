// Changement d'écran animé, voir les règles ::view-transition de globals.css.
import { flushSync } from "react-dom";

/** Applique `update` dans une transition de vue, ou directement si elle n'existe pas. */
export function withTransition(update: () => void): void {
  if (!document.startViewTransition) return update();
  document.startViewTransition(() => flushSync(update));
}
