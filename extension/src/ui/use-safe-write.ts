// Options : une écriture qui échoue est signalée au lieu de passer inaperçue.
import { useCallback, useState } from "react";

export const WRITE_ERROR = "L'enregistrement a échoué : rechargez la page et réessayez.";

export function useSafeWrite() {
  const [error, setError] = useState<string | null>(null);

  /** Attend une écriture ; renvoie faux, et affiche l'erreur, si elle échoue. */
  const attempt = useCallback(async (task: Promise<unknown>): Promise<boolean> => {
    setError(null);
    try {
      await task;
      return true;
    } catch (err) {
      console.warn("[Barrage]", err);
      setError(WRITE_ERROR);
      return false;
    }
  }, []);

  return { error, attempt };
}

export type Attempt = ReturnType<typeof useSafeWrite>["attempt"];
