// État de l'extension, partagé par les trois surfaces (service worker, onglets
// x.com, options). Chaque fonctionnalité écrit sa part dans son propre store.ts,
// et les files d'un compte X (`seen`, `audit`, `unblock`, `retired`) n'ont de sens
// que pour features/blocking : les autres n'y ajoutent ou n'en retirent que des
// comptes, sans en changer les règles. Ce fichier décrit la forme de l'état, le
// lit. Il dépend de modèles purs (lists.ts, remote.ts) dont il agrège le schéma,
// jamais d'un store.ts ni d'un .tsx.
//
// chrome.storage.local plutôt que sync : sync plafonne chaque valeur à 8 Ko,
// trop peu pour une longue liste.
import { STATE_COALESCE_MS } from "./config.ts";
import { DEFAULT_HANDLES } from "../features/lists/defaults.ts";
import type { Earned } from "../features/badges/badges.ts";
import type { Failure } from "../features/blocking/outcome.ts";
import type { Result, Results } from "../features/blocking/queue.ts";
import { effectiveHandles, readListSync, readLists, withSyncDates, type ListDef, type ListSync } from "../features/lists/lists.ts";
import { readGuards, type ListGuard } from "../features/lists/remote.ts";

/** "automation" : soupçon d'automatisation par X. "api" : réponses de X que Barrage ne sait plus lire. */
export type ErrorReason = "auth" | "network" | "automation" | "api" | "other";

/**
 * Ce que le traitement faisait quand l'échec est survenu, pour le texte affiché.
 * "stopped" : arrêt, X a sans doute changé. "retry" : nouvel essai après
 * NETWORK_RETRY_MS. "check" : vérification impossible, reprise après CHECK_RETRY_MS.
 * "reconnected" : X refuse encore une session renouvelée, son jeton web a sans doute changé.
 */
export type ErrorContext = "stopped" | "retry" | "check" | "reconnected" | { refusals: number } | { unblock: string };

export type ErrorCause = Failure & { context?: ErrorContext };

/**
 * Erreur qui empêche tout blocage, affichée dans les options, voir errorText.
 * `staleAt` : au-delà, sans nouvelle écriture, l'onglet qui l'a vue est réputé
 * fermé. `message` : lecture seule, texte rédigé par une version antérieure.
 */
export type BlockingError = Partial<ErrorCause> & {
  message?: string;
  reason: ErrorReason;
  staleAt: number;
  /** Horodatage de l'erreur, en millisecondes. */
  at?: number;
  /** Erreur de session : empreinte de la session X en cause, voir sessionId. */
  session?: string;
};

/** Compte X connu, par identifiant numérique. */
export type Account = { handle?: string };

/**
 * Signe que X a changé, relevé par features/x/health.ts. Il n'arrête rien :
 * sans compte lisible ni tweet repérable, rien ne part déjà vers X. "session" :
 * cookie twid illisible. "timeline" : le fil s'affiche, sans tweet repérable.
 */
export type HealthIssue = "session" | "timeline";

/** Clés stockées communes à tous les comptes X. */
export type SharedState = {
  /**
   * Compte X dont l'état est lu, identifiant numérique du cookie twid. null
   * tant qu'aucun onglet x.com connecté n'a été vu.
   */
  account: string | null;
  /** Comptes X vus dans ce navigateur : chacun a son propre état de blocage. */
  accounts: Record<string, Account>;
  /** Listes de comptes. La collaborative est toujours présente. */
  lists: ListDef[];
  /** Accueil terminé. */
  onboarded: boolean;
  /** Dernière liste X reçue de GitHub, ou null tant qu'aucune n'a été reçue. */
  remote: string[] | null;
  /** Références et mises à jour refusées des listes en ligne, par identifiant de liste. */
  listGuards: Record<string, ListGuard>;
  /** Comptes désactivés dans les options : Barrage ne les bloque plus et ne masque plus leurs tweets. */
  disabled: string[];
  /** Notification sur x.com à chaque compte bloqué par Barrage. */
  notify: boolean;
  /** Notification sur x.com à chaque nouveau badge. */
  notifyBadges: boolean;
  /** Dernière version publiée de l'extension, voir features/updates. */
  latestVersion: string | null;
  /** Dernier signe que X a changé, ou null. */
  health: HealthIssue | null;
};

/**
 * Clés stockées propres à chaque compte X, voir scoped. Leur nom ne se répète
 * nulle part ailleurs : un champ ajouté ici est aussitôt propre à chaque compte.
 */
export type AccountState = {
  /**
   * Comptes retirés de la liste collaborative alors que Barrage les avait bloqués :
   * à débloquer sur X, voir unblockQueue.
   */
  retired: string[];
  /** Date de retrait de ces comptes, en millisecondes, voir RETIRE_GRACE_MS. */
  retiredAt: Record<string, number>;
  /**
   * Déblocages demandés à la main, y compris pour un compte bloqué avant
   * Barrage. Les comptes désactivés que Barrage a bloqués s'y ajoutent d'eux-mêmes,
   * voir unblockQueue.
   */
  unblock: string[];
  /** Comptes de la liste vus dans le fil ou demandés à la main, pas encore bloqués : la file de blocage. */
  seen: string[];
  /** Comptes bloqués sur X par ce compte, avant Barrage compris. Jamais décrémenté. */
  blockCount: number;
  /** Badges obtenus par ce compte X. */
  badges: Earned;
  /** Plus haut palier dont la notification a été fermée ou partagée, 0 si aucun. */
  badgeNotified: number;
  /** Fin de la limite imposée par X, en millisecondes. 0 si aucune. */
  pauseUntil: number;
  /** Soupçons d'automatisation depuis le dernier blocage ou déblocage réussi. */
  strikes: number;
  /** Comptes refusés de suite par X, voir MAX_CONSECUTIVE_FAILURES. */
  failures: string[];
  /** Blocages et déblocages envoyés à X sur ACTIONS_WINDOW_MS, du plus ancien au plus récent. */
  actions: number[];
  /** Requêtes friendships/lookup envoyées sur LOOKUP_WINDOW_MS, du plus ancien au plus récent. */
  lookups: number[];
  /** X annonce ne plus accepter de lookup jusque-là, en millisecondes. 0 si rien. */
  lookupPauseUntil: number;
  error: BlockingError | null;
  /**
   * Comptes de la liste à vérifier auprès de X, une fois par compte X : son
   * état de blocage réel remplace celui que Barrage supposait.
   */
  audit: string[];
};

/** Ce que readState calcule : aucune de ces clés n'est stockée telle quelle. */
type DerivedState = {
  /** Préfixe des clés de stockage du compte, voir scopePrefix. */
  prefix: string;
  /** Liste effective de X : union des listes actives qui couvrent ce réseau. */
  handles: string[];
  /** Comptes de la liste collaborative : celle de GitHub une fois reçue, sinon celle intégrée. */
  official: readonly string[];
  /** Résultats du compte X, stockés un par compte visé, voir RESULT_PREFIX. */
  results: Results;
};

export type State = SharedState & AccountState & DerivedState;

/**
 * Clés stockées hors de State, lues là où elles servent : `legacy`, premier
 * compte X vu, voir scopePrefix ; `bundled`, liste intégrée à la dernière version
 * lancée ; `listSync`, voir ListSync ; `tipDismissed`, préférence d'affichage locale.
 */
export type StoredOnly = { legacy: string; bundled: string[]; listSync: ListSync; tipDismissed: boolean };

/** Clés communes à écrire. Les champs de compte passent par scoped, les résultats par resultEntries. */
export type SharedValues = Partial<SharedState & StoredOnly>;

/** Champs d'un compte X à écrire. */
export type AccountValues = Partial<AccountState>;

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

type AccountField = keyof AccountState;

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
export function resultEntries(results: Results, prefix = ""): Record<string, Result> {
  return Object.fromEntries(Object.entries(results).map(([handle, result]) => [resultKey(handle, prefix), result]));
}

/** Clé de stockage d'un champ propre à un compte X. */
export const accountKey = (prefix: string, field: AccountField): string => prefix + field;

/** Champs à écrire, sous les clés de ce compte X. */
export function scoped(prefix: string, values: AccountValues): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([field, value]) => [prefix + field, value]));
}

/** Clés écoutées par onStateChange : celles que l'on peut réellement voir changer. */
export type StateKey = keyof SharedState | keyof AccountState | "results";

/**
 * Clés dont la modification relance le traitement : liste changée, compte vu
 * dans le fil, blocage demandé à la main ou arrêt levé.
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
  // Une erreur levée dans les options relance le traitement.
  "error",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Les chaînes d'un tableau stocké, ou rien si ce n'en est pas un. */
export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Horodatages stockés, du plus ancien au plus récent. */
function timestamps(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === "number").sort((a, b) => a - b) : [];
}

/** Tout le contenu du stockage, à lire avec readState. */
export async function readStorage(): Promise<Record<string, unknown>> {
  return (await chrome.storage.local.get(null)) as Record<string, unknown>;
}

/**
 * Tout l'état en une lecture. Les valeurs corrompues sont ramenées aux défauts,
 * sauf `results` et `accounts`, dont seule la forme générale est contrôlée.
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
  const own = (field: AccountField) => stored[accountKey(prefix, field)];
  const remote = Array.isArray(stored.remote) ? stringArray(stored.remote) : null;
  const official = remote ?? DEFAULT_HANDLES;
  const lists = withSyncDates(readLists(stored.lists), readListSync(stored.listSync));
  const blockCount = own("blockCount");
  const badges = own("badges");
  const badgeNotified = own("badgeNotified");
  const pauseUntil = own("pauseUntil");
  const strikes = own("strikes");
  const error = own("error");
  const retiredAt = own("retiredAt");
  const lookupPauseUntil = own("lookupPauseUntil");
  return {
    account: current,
    accounts: accountsOf(stored),
    prefix,
    lists,
    handles: effectiveHandles(lists, "x", official),
    official,
    onboarded: stored.onboarded === true,
    remote,
    retired: stringArray(own("retired")),
    retiredAt: isRecord(retiredAt) ? Object.assign(Object.create(null), retiredAt) : Object.create(null),
    listGuards: readGuards(stored.listGuards),
    disabled: stringArray(stored.disabled),
    unblock: stringArray(own("unblock")),
    results,
    seen: stringArray(own("seen")),
    notify: stored.notify !== false,
    notifyBadges: stored.notifyBadges !== false,
    blockCount: typeof blockCount === "number" ? blockCount : 0,
    badges: isRecord(badges) ? Object.assign(Object.create(null), badges) : Object.create(null),
    badgeNotified: typeof badgeNotified === "number" ? badgeNotified : 0,
    pauseUntil: typeof pauseUntil === "number" ? pauseUntil : 0,
    strikes: typeof strikes === "number" ? strikes : 0,
    failures: stringArray(own("failures")),
    actions: timestamps(own("actions")),
    lookups: timestamps(own("lookups")),
    lookupPauseUntil: typeof lookupPauseUntil === "number" ? lookupPauseUntil : 0,
    error: readError(error),
    audit: stringArray(own("audit")),
    latestVersion: typeof stored.latestVersion === "string" ? stored.latestVersion : null,
    health: stored.health === "session" || stored.health === "timeline" ? stored.health : null,
  };
}

/**
 * Erreur stockée. Illisible, elle n'est ni oubliée, ce qui relancerait des
 * requêtes à X, ni laissée telle quelle, sans message ni échéance : le traitement
 * reste arrêté, et « Reprendre » dans les options lève l'arrêt.
 */
function readError(value: unknown): BlockingError | null {
  if (!isRecord(value)) return null;
  const { code, message, staleAt } = value;
  if ((typeof code === "string" || typeof message === "string") && typeof staleAt === "number") return value as BlockingError;
  return { code: "unreadable_error", reason: "api", staleAt: Number.MAX_SAFE_INTEGER };
}

/** Comptes X connus, d'après le contenu du stockage. */
export function accountsOf(stored: Record<string, unknown>): Record<string, Account> {
  return isRecord(stored.accounts) ? (stored.accounts as Record<string, Account>) : {};
}

/**
 * État de chaque compte X connu, d'après le contenu du stockage. Sans compte
 * connu, celui des clés sans préfixe, qui reviendra au premier compte vu.
 */
export function accountStates(stored: Record<string, unknown>): [State, ...State[]] {
  const [first, ...others] = Object.keys(accountsOf(stored));
  if (first === undefined) return [readState(stored)];
  return [readState(stored, first), ...others.map((account) => readState(stored, account))];
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

/** `task`, une seule fois pour une rafale d'appels : il part STATE_COALESCE_MS après le premier. */
export function coalesced(task: () => void): () => void {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      task();
    }, STATE_COALESCE_MS);
  };
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
