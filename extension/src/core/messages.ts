// Contrat des messages entre les options, les content scripts et le service worker.
import type { ImportReport } from "../features/lists/import.ts";

/** Options → content script : vérifier que le script de l'onglet est vivant. */
export const PING = "barrage/ping";

const hasType = (message: unknown, type: string): boolean =>
  typeof message === "object" && message !== null && (message as { type?: unknown }).type === type;

export const isPingRequest = (message: unknown): boolean => hasType(message, PING);

/** Onglet x.com ou options → service worker : écriture à appliquer, voir core/writer.ts. */
export const WRITE = "barrage/write";

export type WriteRequest = { type: typeof WRITE; name: string; args: unknown[] };
export type WriteReply = { ok: true; value: unknown } | { ok: false; error: string };

export function isWriteRequest(message: unknown): message is WriteRequest {
  const m = message as Partial<WriteRequest> | null;
  return typeof m === "object" && m !== null && m.type === WRITE && typeof m.name === "string" && Array.isArray(m.args);
}

/** Options → service worker : retélécharger les listes en ligne sans attendre l'alarme. */
export const REFRESH_LISTS = "barrage/refresh-lists";

export const isRefreshListsRequest = (message: unknown): boolean => hasType(message, REFRESH_LISTS);

/** Options → service worker : télécharger et analyser une liste GitHub, sans rien enregistrer. */
export const IMPORT_LIST = "barrage/import-list";

export type ImportListRequest = { type: typeof IMPORT_LIST; url: string };
export type ImportListReply = (Extract<ImportReport, { ok: true }> & { url: string }) | Extract<ImportReport, { ok: false }>;

export function isImportListRequest(message: unknown): message is ImportListRequest {
  return hasType(message, IMPORT_LIST) && typeof (message as Partial<ImportListRequest>).url === "string";
}

/**
 * Notification de badge → service worker : ouvrir l'onglet Badges. Une page
 * x.com ne peut pas ouvrir une page d'extension sans web_accessible_resources,
 * que x.com pourrait détecter.
 */
export const OPEN_BADGES = "barrage/open-badges";

export const isOpenBadgesRequest = (message: unknown): boolean => hasType(message, OPEN_BADGES);

/** Réponse d'un content script aux pings des options : y répondre prouve qu'il est vivant. */
export type PingReply = { session: boolean };
