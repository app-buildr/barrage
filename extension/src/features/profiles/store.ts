// Stockage des profils, sous `profile:<identifiant>` : commun à tous les
// comptes X, puisqu'il décrit le compte visé et non celui qui bloque. Simple
// cache, hors des sauvegardes (voir backup.ts) : une écriture perdue ne coûte
// qu'une notification sans visage, elle n'arrête jamais le blocage.
import type { StateChanges } from "../../core/state.ts";
import { storedProfile, type Profile } from "./profile.ts";

const PROFILE_PREFIX = "profile:";

export const profileKey = (handle: string): string => PROFILE_PREFIX + handle;

/**
 * Profil à écrire avec le résultat du blocage daté `at`, dans la même écriture
 * (voir runner.ts). La date rend la valeur neuve à chaque blocage : Chrome ne
 * signale pas une clé réécrite à l'identique, et la notification lit le profil
 * dans ce signal.
 */
export const profileEntry = (handle: string, profile: Profile, at: number): Record<string, unknown> => ({
  [profileKey(handle)]: { ...profile, at },
});

/**
 * Profil écrit en même temps que le résultat d'un blocage, lu dans les
 * changements que cette écriture signale. Un blocage qui n'en écrit pas
 * (hérité, restauré, « déjà bloqué ») ne montre donc jamais le profil laissé
 * par un blocage plus ancien, peut-être celui d'un autre titulaire.
 */
export const writtenProfile = (changes: StateChanges, handle: string): Profile | null =>
  storedProfile(changes[profileKey(handle)]?.newValue);

/** Oublie le profil d'un compte : débloqué, ou bloqué sans profil lisible. Ne lève jamais. */
export async function forgetProfile(handle: string): Promise<void> {
  try {
    await chrome.storage.local.remove(profileKey(handle));
  } catch (err) {
    console.warn("[Barrage] profil non oublié :", handle, err);
  }
}
