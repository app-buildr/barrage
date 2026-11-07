// Registre des écritures que le service worker accepte par message : qui peut
// les demander, et ce que valent leurs arguments. Un onglet x.com est moins sûr
// que les options : il n'a accès qu'aux écritures marquées `content`, celles du
// traitement et du fil. Fonctions de contrôle testées dans tests/writer.test.ts.
import type { WriteEntry } from "../core/writer.ts";
import { restoreBackup } from "./backup/store.ts";
import { dismissBadge, recordBlockSuccess, syncBadges } from "./badges/store.ts";
import { isResult } from "./blocking/queue.ts";
import { addHandles, requestBlock, requestUnblock, setEnabled } from "./accounts/store.ts";
import {
  finishUnblock,
  holdLookups,
  markAlreadyBlocked,
  recordAudit,
  recordBlockFailure,
  recordChecks,
  recordRequest,
  refuseUnblock,
  resumeBlocking,
  setHealth,
  useAccount,
} from "./blocking/store.ts";
import { parseHandle } from "./lists/handles.ts";
import { validateListUrl } from "./lists/import.ts";
import { LIST_NETWORKS } from "./lists/lists.ts";
import {
  acceptPendingList,
  addList,
  completeOnboarding,
  removeList,
  renameList,
  setListActive,
  setListNetworks,
} from "./lists/store.ts";
import { setNotifications } from "./notifications/store.ts";
import { addSeen } from "./timeline/store.ts";

type Check = (value: unknown) => boolean;

const isString: Check = (value) => typeof value === "string";
const isBoolean: Check = (value) => typeof value === "boolean";
const isNumber: Check = (value) => typeof value === "number" && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const orNull = (check: Check): Check => (value) => value === null || check(value);

const arrayOf = (check: Check): Check => (value) => Array.isArray(value) && value.every(check);

const isAnything: Check = () => true;

/** Identifiant normalisé : `addHandles` et les files le supposent, rien d'autre ne le vérifie. */
const isHandle: Check = (value) => typeof value === "string" && parseHandle(value) === value;
const isHandles = arrayOf(isHandle);

const isAccountId: Check = (value) => typeof value === "string" && /^\d+$/.test(value);
/** Compte X visé, facultatif : un argument absent passe par JSON en null ou manque. */
const isAccount: Check = (value) => value === undefined || value === null || isAccountId(value);

const isFailure: Check = (value) =>
  isRecord(value) && isString(value.code) && (value.param === undefined || isNumber(value.param));

/** Seuls ces champs peuvent être levés par message, voir Cleared. */
const isCleared: Check = (value) =>
  isRecord(value) && Object.entries(value).every(([key, flag]) => ["error", "failures", "strikes"].includes(key) && flag === true);

const isResults: Check = (value) =>
  isRecord(value) && Object.entries(value).every(([handle, result]) => isHandle(handle) && isResult(result));

const isNetworks = arrayOf((value) => LIST_NETWORKS.includes(value as (typeof LIST_NETWORKS)[number]));

function isNewList(value: unknown): boolean {
  if (!isRecord(value) || !isHandles(value.handles) || !isNetworks(value.networks)) return false;
  if (value.source === "file") return true;
  return value.source === "github" && typeof value.url === "string" && validateListUrl(value.url).ok;
}

function isOnboardingChoice(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "later") return true;
  return value.kind === "official" ? isNetworks(value.networks) : value.kind === "list" && isNewList(value.list);
}

const isNotifications: Check = (value) =>
  isRecord(value) && Object.entries(value).every(([key, flag]) => ["notify", "notifyBadges"].includes(key) && isBoolean(flag));

const isHealth = orNull((value) => value === "session" || value === "timeline");
const isRequestKind: Check = (value) => value === "action" || value === "lookup";

const fromContent = <F extends WriteEntry["run"]>(run: F, ...checks: Check[]) => ({ run, checks, content: true });
const fromOptions = <F extends WriteEntry["run"]>(run: F, ...checks: Check[]) => ({ run, checks, content: false });

export const WRITES = {
  acceptPendingList: fromOptions(acceptPendingList, isString),
  addHandles: fromOptions(addHandles, isHandles),
  addList: fromOptions(addList, isNewList),
  addSeen: fromContent(addSeen, isHandles, isAccount),
  completeOnboarding: fromOptions(completeOnboarding, isOnboardingChoice),
  dismissBadge: fromContent(dismissBadge, isNumber, isAccount),
  finishUnblock: fromContent(finishUnblock, isHandle, orNull(isResult), isCleared, isAccount),
  holdLookups: fromContent(holdLookups, isNumber, isAccount),
  markAlreadyBlocked: fromContent(markAlreadyBlocked, isHandles, isAccount),
  recordAudit: fromContent(recordAudit, isHandles, isHandles, isHandles, isCleared, isAccount),
  recordBlockFailure: fromContent(recordBlockFailure, isHandle, isFailure, isNumber, isAccount),
  recordBlockSuccess: fromContent(recordBlockSuccess, isAccount),
  recordChecks: fromContent(recordChecks, isResults, isCleared, isAccount),
  recordRequest: fromContent(recordRequest, isRequestKind, isAccount),
  refuseUnblock: fromContent(refuseUnblock, isHandle, isFailure, isAccount),
  removeList: fromOptions(removeList, isString),
  renameList: fromOptions(renameList, isString, isString),
  requestBlock: fromOptions(requestBlock, isHandle),
  requestUnblock: fromOptions(requestUnblock, isHandle),
  // Relue champ par champ à l'arrivée, voir checkBackup.
  restoreBackup: fromOptions(restoreBackup, isAnything),
  resumeBlocking: fromOptions(resumeBlocking, isAccount),
  setEnabled: fromContent(setEnabled, isHandle, isBoolean),
  setHealth: fromContent(setHealth, isHealth),
  setListActive: fromOptions(setListActive, isString, isBoolean),
  setListNetworks: fromOptions(setListNetworks, isString, isNetworks),
  setNotifications: fromOptions(setNotifications, isNotifications),
  syncBadges: fromContent(syncBadges, isAccount),
  useAccount: fromContent(useAccount, isAccountId, orNull(isHandle)),
};

export type Writes = { [K in keyof typeof WRITES]: (typeof WRITES)[K]["run"] };
