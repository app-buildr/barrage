// Pile des notifications dans la page x.com : un hôte unique, dont le Shadow DOM
// fermé isole les styles de la notification de ceux de x.com, et inversement.
import { createRoot } from "react-dom/client";
import css from "./toast.css?inline";
import { Toaster } from "./Toaster.tsx";
import type { ToastStore } from "./toasts.ts";

const HOST_ID = "barrage-toasts";

export function mountToaster(store: ToastStore): void {
  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "closed" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  shadow.adoptedStyleSheets = [sheet];
  document.body.append(host);
  createRoot(shadow).render(<Toaster store={store} />);
}
