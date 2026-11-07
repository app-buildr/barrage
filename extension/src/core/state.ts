// État de l'extension, partagé par les trois surfaces (service worker, onglets
// x.com, options). Chaque fonctionnalité écrit sa part dans son propre store.ts ;
// ce fichier ne fait que décrire la forme de l'état et le lire.
//
// chrome.storage.local plutôt que sync : sync plafonne chaque valeur à 8 Ko,
// trop peu pour une longue liste.
import { RETIRE_GRACE_MS } from "./config.ts";
import { DEFAULT_HANDLES } from "../features/lists/defaults.ts";
import type { Earned } from "../features/badges/badges.ts";
import { activeHandles, eligible, isBlocked, resultOf, type Result, type Results } from "../features/blocking/queue.ts";
import { effectiveHandles, readLists, type ListDef } from "../features/lists/lists.ts";
import { readGuards, type ListGuard } from "../features/lists/remote.ts";

export type ErrorReason = "auth" | "network" | "other";

/**
 * Erreur qui empêche tout blocage, affichée dans les options. `staleAt` :
 * au-delà, sans nouvelle écriture, l'onglet qui l'a vue est réputé fermé.
 */
export type BlockingError = {
  message: string;
  reason: ErrorReason;
  staleAt: number;
  /** Horodatage de l'erreur, en millisecondes. */
  at?: number;
  /** Erreur de session : empreinte de la session X en cause, voir sessionId. */
  session?: string;
};

/** Compte X connu, par identifiant numérique. */
export type Account = { handle?: string };

export type State = {
  /**
   * Compte X dont l'état est lu, identifiant numérique du cookie twid. null
   * tant qu'aucun onglet x.com connecté n'a été vu.
   */
  account: string | null;
  /** Comptes X vus dans ce navigateur : chacun a son propre état de blocage. */
  accounts: Record<string, Account>;
  /** Préfixe des clés de stockage du compte, voir scopePrefix. */
  prefix: string;
  /** Listes de comptes, communes à tous les comptes X. La collaborative est toujours présente. */
  lists: ListDef[];
  /** Liste effective de X : union des listes actives qui couvrent ce réseau. */
  handles: string[];
  /** Comptes de la liste collaborative : celle de GitHub une fois reçue, sinon celle intégrée. */
  official: readonly string[];
  /** Accueil terminé. */
  onboarded: boolean;
  /** Dernière liste X reçue de GitHub, ou null tant qu'aucune n'a été reçue. */
  remote: string[] | null;
  /**
   * Comptes retirés de la liste collaborative alors que Barrage les avait bloqués :
   * à débloquer sur X, voir unblockQueue.
   */
  retired: string[];
  /** Date de retrait de ces comptes, en millisecondes, voir RETIRE_GRACE_MS. */
  retiredAt: Record<string, number>;
  /** Références et mises à jour refusées des listes en ligne, par identifiant de liste. */
  listGuards: Record<string, ListGuard>;
  results: Results;
  /** Comptes désactivés dans les options : Barrage ne les bloque plus et ne masque plus leurs tweets. */
  disabled: string[];
  /**
   * Déblocages demandés à la main, y compris pour un compte bloqué avant
   * Barrage. Les comptes désactivés que Barrage a bloqués s'y ajoutent d'eux-mêmes,
   * voir unblockQueue.
   */
  unblock: string[];
  /** Comptes de la liste vus dans le fil et pas encore bloqués, à traiter en priorité. */
  seen: string[];
  /** Notification sur x.com à chaque compte bloqué par Barrage. */
  notify: boolean;
  /** Notification sur x.com à chaque nouveau badge. */
  notifyBadges: boolean;
  /** Comptes bloqués sur X par ce compte, avant Barrage compris. Jamais décrémenté. */
  blockCount: number;
  /** Badges obtenus par ce compte X. */
  badges: Earned;
  /** Plus haut palier dont la notification a été fermée ou partagée, 0 si aucun. */
  badgeNotified: number;
  /** Fin de la limite imposée par X, en millisecondes. 0 si aucune. */
  pauseUntil: number;
  error: BlockingError | null;
  /**
   * Comptes de la liste à vérifier auprès de X, une fois par compte X : son
   * état de blocage réel remplace celui que Barrage supposait.
   */
  audit: string[];
  /** Dernière version publiée de l'extension, voir features/updates. */
  latestVersion: string | null;
};

// La liste collaborative n'est pas copiée dans `lists` : elle est lue dans
// `remote`, ou dans lists/x.json intégré au build, pour que la modifier sur
// GitHub la mette à jour chez tous les utilisateurs.
//
// Les résultats sont stockés un par compte, sous `result:<identifiant>` : un
// blocage n'écrit que sa propre clé, sans réécrire ni écraser ceux des autres.
const RESULT_PREFIX = "result:";

// Chaque compte X a son propre état de blocage : un compte bloqué depuis l'un
// ne l'est pas sur l'autre. Ses clés portent le préfixe `acct:<id>/`, sauf
// celles du premier compte vu (`legacy`), qui garde les clés sans préfixe
// d'avant la prise en charge de plusieurs comptes : rien n'est déplacé. Tant
// qu'aucun compte n'est vu, les clés sans préfixe valent pour le compte
// connecté, qui deviendra ce premier compte : son préfixe ne change jamais.
const ACCOUNT_PREFIX_RE = /^acct:\d+\//;

/** Champs de l'état propres à chaque compte X. La liste et les réglages sont communs. */
const ACCOUNT_FIELDS = [
  "retired",
  "retiredAt",
  "unblock",
  "seen",
  "pauseUntil",
  "error",
  "audit",
  "blockCount",
  "badges",
  "badgeNotified",
] as const;

type AccountField = (typeof ACCOUNT_FIELDS)[number];

/** Préfixe des clés d'un compte X. */
export function scopePrefix(account: string | null, legacy: string | null): string {
  return account === null || legacy === null || account === legacy ? "" : `acct:${account}/`;
}

/**
 * Compte X à lire et préfixe de ses clés, d'après les clés `account` et
 * `legacy` stockées. Par défaut, le dernier compte connecté sur x.com.
 */
function scopeOf(stored: Record<string, unknown>, account?: string | null): { account: string | null; prefix: string } {
  const current = account ?? (typeof stored.account === "string" ? stored.account : null);
  const legacy = typeof stored.legacy === "string" ? stored.legacy : null;
  return { account: current, prefix: scopePrefix(current, legacy) };
}

/** Champ de l'état porté par une clé de stockage, préfixe de compte retiré. */
function fieldOf(key: string): string {
  const field = key.replace(ACCOUNT_PREFIX_RE, "");
  return field.startsWith(RESULT_PREFIX) ? "results" : field;
}

export const resultKey = (handle: string, prefix = ""): string => prefix + RESULT_PREFIX + handle;

/** Compte dont la clé de stockage porte le résultat, pour le compte X de ce préfixe, ou null. */
export function resultHandle(key: string, prefix = ""): string | null {
  const start = prefix + RESULT_PREFIX;
  return key.startsWith(start) ? key.slice(start.length) : null;
}

/** Résultats à écrire, sous leurs clés de stockage. */
export function resultEntries(results: Results, prefix = ""): Record<string, unknown> {
  return Object.fromEntries(Object.entries(results).map(([handle, result]) => [resultKey(handle, prefix), result]));
}

/** Clé de stockage d'un champ propre à un compte X. */
export const accountKey = (prefix: string, field: AccountField): string => prefix + field;

/**
 * Valeurs à écrire, les champs propres à un compte X sous les clés de ce
 * compte. Les autres clés (liste, réglages) sont écrites telles quelles.
 */
export function scoped(prefix: string, values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      (ACCOUNT_FIELDS as readonly string[]).includes(key) ? accountKey(prefix, key as AccountField) : key,
      value,
    ]),
  );
}

export type StateKey = keyof State;

/**
 * Clés dont la modification relance le traitement : liste changée, compte vu
 * dans le fil ou blocage demandé à la main.
 */
export const QUEUE_KEYS: readonly StateKey[] = [
  "lists",
  "remote",
  "retired",
  "disabled",
  "unblock",
  "results",
  "seen",
  "audit",
  "account",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Comptes que Barrage traite : la liste moins ceux désactivés. */
export function active(state: State): string[] {
  return activeHandles(state.handles, state.disabled);
}

/** File de blocage : comptes de la liste vus dans le fil ou demandés à la main. */
export function queueOrder(state: State): string[] {
  return eligible(active(state), state.seen);
}

/**
 * Comptes à débloquer sur X : demandes à la main encore sur Off (ou sorties
 * de la liste depuis, la demande reste due), puis tout
 * compte sur Off ou retiré de la liste collaborative que Barrage a bloqué. Calculée
 * plutôt que stockée, la file ne peut pas manquer un blocage qui aboutit juste
 * après le passage sur Off. Un déblocage refusé par X n'est relancé que par
 * une nouvelle demande. Un compte retiré attend RETIRE_GRACE_MS, et sans date
 * de retrait il attend que la prochaine synchronisation lui en donne une.
 */
export function unblockQueue(state: State, now = Date.now()): string[] {
  const disabled = new Set(state.disabled);
  const blockedByUs = (h: string) => {
    const result = resultOf(state.results, h);
    return result?.state === "blocked" && !result.unblockFailed;
  };
  const listed = new Set(state.handles);
  const graceOver = (h: string) => now - (state.retiredAt[h] ?? now) >= RETIRE_GRACE_MS;
  return [
    ...new Set([
      ...state.unblock.filter((h) => disabled.has(h) || !listed.has(h)),
      ...state.disabled.filter(blockedByUs),
      // Un compte remis dans la liste entre-temps n'est plus à débloquer.
      ...state.retired.filter((h) => !listed.has(h) && blockedByUs(h) && graceOver(h)),
    ]),
  ];
}

/**
 * Comptes bloqués sortis de la liste effective (liste désactivée, supprimée ou
 * mise à jour) : ils restent bloqués et déblocables. Ceux retirés de la liste
 * collaborative n'en sont pas : Barrage les débloque de lui-même.
 */
export function offListHandles(state: State): string[] {
  const listed = new Set(state.handles);
  const retired = new Set(state.retired);
  return Object.keys(state.results).filter(
    (h) => !listed.has(h) && !retired.has(h) && isBlocked(resultOf(state.results, h)),
  );
}

/** Tout le contenu du stockage, à lire avec readState. */
export async function readStorage(): Promise<Record<string, unknown>> {
  return (await chrome.storage.local.get(null)) as Record<string, unknown>;
}

/**
 * Tout l'état en une lecture, valeurs corrompues ramenées aux défauts.
 * @param account compte X à lire ; par défaut, le dernier connecté sur x.com
 */
export async function getState(account?: string | null): Promise<State> {
  return readState(await readStorage(), account);
}

/** État d'un compte X d'après le contenu du stockage : plusieurs comptes pour une seule lecture. */
export function readState(stored: Record<string, unknown>, account?: string | null): State {
  const { account: current, prefix } = scopeOf(stored, account);
  const results: Results = Object.create(null);
  for (const [key, value] of Object.entries(stored)) {
    const handle = resultHandle(key, prefix);
    if (handle !== null && isRecord(value)) results[handle] = value as Result;
  }
  const own = (field: AccountField) => stored[prefix + field];
  const remote = Array.isArray(stored.remote) ? strings(stored.remote) : null;
  const official = remote ?? DEFAULT_HANDLES;
  const lists = readLists(stored.lists);
  const blockCount = own("blockCount");
  const badges = own("badges");
  const badgeNotified = own("badgeNotified");
  const pauseUntil = own("pauseUntil");
  const error = own("error");
  const retiredAt = own("retiredAt");
  return {
    account: current,
    accounts: accountsOf(stored),
    prefix,
    lists,
    handles: effectiveHandles(lists, "x", official),
    official,
    onboarded: stored.onboarded === true,
    remote,
    retired: strings(own("retired")),
    retiredAt: isRecord(retiredAt) ? Object.assign(Object.create(null), retiredAt) : Object.create(null),
    listGuards: readGuards(stored.listGuards),
    disabled: strings(stored.disabled),
    unblock: strings(own("unblock")),
    results,
    seen: strings(own("seen")),
    notify: stored.notify !== false,
    notifyBadges: stored.notifyBadges !== false,
    blockCount: typeof blockCount === "number" ? blockCount : 0,
    badges: isRecord(badges) ? Object.assign(Object.create(null), badges) : Object.create(null),
    badgeNotified: typeof badgeNotified === "number" ? badgeNotified : 0,
    pauseUntil: typeof pauseUntil === "number" ? pauseUntil : 0,
    error: isRecord(error) ? (error as BlockingError) : null,
    audit: strings(own("audit")),
    latestVersion: typeof stored.latestVersion === "string" ? stored.latestVersion : null,
  };
}

/** Comptes X connus, d'après le contenu du stockage. */
export function accountsOf(stored: Record<string, unknown>): Record<string, Account> {
  return isRecord(stored.accounts) ? (stored.accounts as Record<string, Account>) : {};
}

/**
 * État de chaque compte X connu, d'après le contenu du stockage. Sans compte
 * connu, celui des clés sans préfixe, qui reviendra au premier compte vu.
 */
export function accountStates(stored: Record<string, unknown>): State[] {
  const accounts = Object.keys(accountsOf(stored));
  return accounts.length ? accounts.map((account) => readState(stored, account)) : [readState(stored)];
}

/** Préfixe des clés d'un compte X, sans lire tout l'état ; par défaut, le dernier connecté. */
export async function prefixFor(account?: string | null): Promise<string> {
  return scopeOf(await chrome.storage.local.get({ account: null, legacy: null }), account).prefix;
}

export type StateChanges = { [key: string]: chrome.storage.StorageChange };

/**
 * Appelle `listener` à chaque écriture de l'une des clés données, ou de
 * n'importe quelle clé si la liste est omise. Un champ propre à un compte X
 * déclenche l'appel quel que soit le compte.
 */
export function onStateChange(
  listener: (changes: StateChanges) => void,
  keys?: readonly StateKey[],
): () => void {
  const onChanged = (changes: StateChanges, area: string) => {
    if (area !== "local") return;
    const fields = new Set(Object.keys(changes).map(fieldOf));
    if (!keys || keys.some((key) => fields.has(key))) listener(changes);
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}

/**
 * Résultats avant et après une écriture, limités aux comptes modifiés, pour
 * le compte X de ce préfixe.
 */
export function resultChanges(changes: StateChanges, prefix = ""): { before: Results; after: Results } {
  const before: Results = Object.create(null);
  const after: Results = Object.create(null);
  for (const [key, change] of Object.entries(changes)) {
    const handle = resultHandle(key, prefix);
    if (handle === null) continue;
    if (isRecord(change.oldValue)) before[handle] = change.oldValue as Result;
    if (isRecord(change.newValue)) after[handle] = change.newValue as Result;
  }
  return { before, after };
}
