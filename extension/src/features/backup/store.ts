// Écriture de la sauvegarde, appliquée par le service worker comme les autres.
import { readStorage } from "../../core/state.ts";
import { BACKUP_OTHER_ACCOUNT, checkBackup, mergeBackup, type Restore } from "./backup.ts";

/** Restaure une sauvegarde, relue ici : rien n'est écrit si elle est refusée. */
export async function restoreBackup(backup: unknown): Promise<Restore> {
  const check = checkBackup(backup);
  if (!check.ok) return check;
  const values = mergeBackup(await readStorage(), check.data);
  if (!values) return { ok: false, reason: BACKUP_OTHER_ACCOUNT };
  await chrome.storage.local.set(values);
  return { ok: true };
}
