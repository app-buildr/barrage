// Service worker : relève la dernière version publiée de l'extension, aux
// mêmes moments que les listes (voir entries/background.ts).
import { RELEASES_URL } from "../../core/config.ts";
import { parseVersion } from "./version.ts";

/** Hors ligne ou réponse illisible : la version déjà relevée reste. */
export async function checkLatestVersion(): Promise<void> {
  if (!RELEASES_URL) return;
  let body: unknown;
  try {
    const response = await fetch(RELEASES_URL, { cache: "no-store", credentials: "omit", redirect: "error" });
    if (!response.ok) {
      console.warn("[Barrage] téléchargement refusé :", RELEASES_URL, response.status);
      return;
    }
    body = await response.json();
  } catch (err) {
    if (navigator.onLine !== false) console.warn("[Barrage] téléchargement refusé :", RELEASES_URL, err);
    return;
  }
  const latestVersion = parseVersion((body as { tag_name?: unknown } | null)?.tag_name);
  if (latestVersion) await chrome.storage.local.set({ latestVersion });
}
