// Contrat des messages entre les options, les content scripts et le service worker.
import type { ImportReport } from "../features/lists/import.ts";

/** Options → content script : vérifier que le script de l'onglet est vivant. */
export const PING = "barrage/ping";

export type PingRequest = { type: typeof PING };

/**
 * Message venu de la page d'options de cette extension. L'adresse de l'expéditeur
 * vient du navigateur : un onglet x.com compromis ne peut pas se faire passer pour elle.
 */
export const fromOptions = (sender: chrome.runtime.MessageSender): boolean =>
  sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL("options.html")) === true;

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

export type RefreshListsRequest = { type: typeof REFRESH_LISTS };
/** Toujours vrai : prouve que le rafraîchissement est terminé. */
export type RefreshListsReply = boolean;

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
 * que Barrage ne déclare pas : ses fichiers n'ont pas à être exposés à x.com. Sa
 * présence reste visible par ailleurs (attribut de masquage, hôte des
 * notifications, verrou du traitement).
 */
export const OPEN_BADGES = "barrage/open-badges";

export type OpenBadgesRequest = { type: typeof OPEN_BADGES };

export const isOpenBadgesRequest = (message: unknown): boolean => hasType(message, OPEN_BADGES);

/** Service worker → content script : raccourci d'annulation, voir features/notifications/command.ts. */
export const UNDO_LAST = "barrage/undo-last";

export type UndoLastRequest = { type: typeof UNDO_LAST };

export const isUndoLastRequest = (message: unknown): boolean => hasType(message, UNDO_LAST);

/** Réponse d'un content script aux pings des options : y répondre prouve qu'il est vivant. */
export type PingReply = { session: boolean };

/** Tout ce qui s'envoie entre contextes : chaque envoi s'écrit avec `satisfies Message`. */
export type Message = PingRequest | WriteRequest | RefreshListsRequest | ImportListRequest | OpenBadgesRequest | UndoLastRequest;
