// Fondu d'arrivée de la page d'options, voir le <style> de options.html.
import { useEffect } from "react";

/** Délai maximal d'attente des polices, pour ne pas retarder l'affichage. */
const FONTS_TIMEOUT_MS = 300;

/** Fait apparaître la page une fois montée (`mounted`) et les polices chargées. */
export function useReveal(mounted: boolean): void {
  useEffect(() => {
    if (!mounted) return;
    const timeout = new Promise((resolve) => setTimeout(resolve, FONTS_TIMEOUT_MS));
    void Promise.race([document.fonts.ready, timeout]).then(() => document.documentElement.classList.add("ready"));
  }, [mounted]);
}
