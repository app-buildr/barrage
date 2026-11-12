// Stockage des profils, sous `profile:<identifiant>` : commun à tous les
// comptes X, puisqu'il décrit le compte visé et non celui qui bloque. Simple
// cache, hors des sauvegardes (voir backup.ts) : une écriture perdue ne coûte
// qu'une notification sans visage, elle n'arrête jamais le blocage.
import { storedProfile, type Profile } from "./profile.ts";

const PROFILE_PREFIX = "profile:";

export const profileKey = (handle: string): string => PROFILE_PREFIX + handle;

/**
 * Enregistre le profil renvoyé par X au blocage, ou oublie l'ancien s'il n'a
 * pas pu être lu : celui d'avant pourrait être celui d'un autre titulaire de
 * l'identifiant. Ne lève jamais.
 */
export async function saveProfile(handle: string, profile: Profile | null): Promise<void> {
  try {
    if (profile) await chrome.storage.local.set({ [profileKey(handle)]: profile });
    else await chrome.storage.local.remove(profileKey(handle));
  } catch (err) {
    console.warn("[Barrage] profil non enregistré :", handle, err);
  }
}

/** Compte débloqué : son profil n'a plus de raison d'être gardé. Ne lève jamais. */
export const forgetProfile = (handle: string): Promise<void> => saveProfile(handle, null);

/** Profils stockés de ces comptes, ceux qui en ont un. */
export async function getProfiles(handles: readonly string[]): Promise<Record<string, Profile>> {
  const profiles: Record<string, Profile> = Object.create(null);
  if (!handles.length) return profiles;
  const stored = await chrome.storage.local.get(handles.map(profileKey));
  for (const handle of handles) {
    const profile = storedProfile(stored[profileKey(handle)]);
    if (profile) profiles[handle] = profile;
  }
  return profiles;
}
