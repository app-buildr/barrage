// Service worker : sérialise les écritures qui lisent l'état puis le réécrivent.
// Elles s'y appliquent une à la fois, d'où qu'elles viennent (onglets x.com,
// options, service worker lui-même). Sans cela, deux écritures simultanées
// liraient le même état et la seconde effacerait la première. Les écritures de
// clés indépendantes (résultats, pause, erreur) restent directes, voir
// features/blocking/store.ts.
import { restoreBackup } from "../features/backup/store.ts";
import { dismissBadge, recordBlockSuccess, syncBadges } from "../features/badges/store.ts";
import {
  acceptPendingList,
  addList,
  completeOnboarding,
  removeList,
  renameList,
  setListActive,
  setListNetworks,
  updateListHandles,
} from "../features/lists/store.ts";
import { addHandles, requestBlock, requestUnblock, setEnabled } from "../features/accounts/store.ts";
import {
  finishUnblock,
  holdLookups,
  markAlreadyBlocked,
  recordAudit,
  recordBlockFailure,
  recordRequest,
  refuseUnblock,
  resumeBlocking,
  setHealth,
  useAccount,
} from "../features/blocking/store.ts";
import { setNotifications } from "../features/notifications/store.ts";
import { addSeen } from "../features/timeline/store.ts";
import { isWriteRequest, type WriteReply } from "./messages.ts";

const WRITES = {
  acceptPendingList,
  addHandles,
  addList,
  addSeen,
  completeOnboarding,
  dismissBadge,
  finishUnblock,
  holdLookups,
  markAlreadyBlocked,
  recordAudit,
  recordBlockFailure,
  recordBlockSuccess,
  recordRequest,
  refuseUnblock,
  removeList,
  renameList,
  requestBlock,
  requestUnblock,
  restoreBackup,
  resumeBlocking,
  setEnabled,
  setHealth,
  setListActive,
  setListNetworks,
  setNotifications,
  syncBadges,
  updateListHandles,
  useAccount,
};

export type Writes = typeof WRITES;

let tail: Promise<unknown> = Promise.resolve();

/** Applique `task` après les écritures en cours, dans l'ordre d'arrivée. */
export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => {});
  return run;
}

export function serveWrites(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (reply: WriteReply) => void) => {
    if (!isWriteRequest(message) || !Object.hasOwn(WRITES, message.name)) return false;
    const write = WRITES[message.name as keyof Writes] as (...args: unknown[]) => Promise<unknown>;
    serial(() => write(...message.args)).then(
      (value) => sendResponse({ ok: true, value }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true; // réponse asynchrone
  });
}
