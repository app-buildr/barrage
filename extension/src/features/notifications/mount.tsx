// Pile des notifications dans la page x.com : un hôte unique, dont le Shadow DOM
// fermé isole les styles de la notification de ceux de x.com, et inversement.
import { createRoot } from "react-dom/client";
import css from "./toast.css?inline";
import { Toaster } from "./Toaster.tsx";
import type { BadgeStore, ToastStore } from "./toasts.ts";

const HOST_ID = "barrage-toasts";

/**
 * Chrome n'applique pas les @property d'un Shadow DOM : les variables --tw-*
 * de Tailwind n'y ont pas leur valeur initiale (border, outline… restent sans
 * effet). On la redonne par une règle ordinaire, dans la couche « properties »
 * de Tailwind, la plus faible : n'importe quel utilitaire la remplace.
 */
function propertyFallback(sheet: CSSStyleSheet): void {
  const values = [...sheet.cssRules]
    .filter((rule): rule is CSSPropertyRule => rule instanceof CSSPropertyRule)
    .map((rule) => `${rule.name}:${rule.initialValue ?? "initial"}`);
  if (values.length) {
    sheet.insertRule(`@layer properties{*,::before,::after,::backdrop{${values.join(";")}}}`, sheet.cssRules.length);
  }
}

/** Monte la pile et renvoie son hôte, à remettre dans la page s'il en est retiré. */
export function mountToaster(
  store: ToastStore,
  badges: BadgeStore,
  onDismissBadge: (palier: number) => void,
  onOpenBadges: () => void,
): HTMLElement {
  const host = document.createElement("div");
  host.id = HOST_ID;
  // La notification est en français, quelle que soit la langue de x.com.
  host.lang = "fr";
  const shadow = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  propertyFallback(sheet);
  shadow.adoptedStyleSheets = [sheet];
  document.body.append(host);
  createRoot(shadow).render(<Toaster store={store} badges={badges} onDismissBadge={onDismissBadge} onOpenBadges={onOpenBadges} />);
  return host;
}
