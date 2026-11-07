// État stocké de l'extension, pour les composants React de la page d'options :
// relu à chaque écriture, et à l'échéance d'une erreur ou d'une limite de X
// pour qu'elles disparaissent de l'affichage, même sans nouvelle écriture.
import { useEffect, useState } from "react";
import { coalesced, getState, onStateChange, type State } from "@/core/state.ts";

/** La pause la plus longue, marge comprise. */
const MAX_TIMER_MS = 2 * 24 * 60 * 60_000;

/** null le temps de la première lecture. */
export function useExtensionState(): State | null {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let alive = true;

    async function refresh(): Promise<void> {
      const next = await getState();
      if (!alive) return;
      setState(next);
      clearTimeout(expiry);
      const time = Date.now();
      // Une erreur permanente a une échéance infinie : setTimeout la prendrait pour 0.
      const deadlines = [next.error?.staleAt ?? 0, next.pauseUntil].filter((t) => t > time && t - time < MAX_TIMER_MS);
      if (deadlines.length) expiry = setTimeout(() => void refresh(), Math.min(...deadlines) - time + 50);
    }

    const unsubscribe = onStateChange(coalesced(() => void refresh()));
    void refresh();
    return () => {
      alive = false;
      clearTimeout(expiry);
      unsubscribe();
    };
  }, []);

  return state;
}
