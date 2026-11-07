// Écran affiché par la page d'options : l'accueil tant qu'il n'est pas terminé,
// sinon l'onglet porté par le hash. Tout changement passe par une transition.
import { useEffect, useState } from "react";
import { tabFromHash } from "./main-tab.ts";
import { withTransition } from "@/ui/transition.ts";

/** @param onboarded undefined le temps de la première lecture de l'état */
export function useMainRoute(onboarded: boolean | undefined) {
  const [tab, setTab] = useState(() => tabFromHash(location.hash));
  // null le temps de la première lecture de l'état.
  const [welcome, setWelcome] = useState<boolean | null>(null);

  // Lien « Voir mes badges », clic sur un onglet, retour arrière.
  useEffect(() => {
    const onHashChange = () => {
      withTransition(() => setTab(tabFromHash(location.hash)));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (onboarded === undefined) return;
    if (welcome === null) {
      setWelcome(!onboarded);
      if (!onboarded) history.replaceState(null, "", "#accueil");
    } else if (welcome && onboarded) {
      // Accueil terminé : la page passe aux options sans se recharger.
      history.replaceState(null, "", "#comptes");
      withTransition(() => {
        setWelcome(false);
        setTab("comptes");
      });
    }
  }, [onboarded, welcome]);

  return { tab, welcome };
}
