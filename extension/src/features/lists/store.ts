// Écritures des listes de comptes, appliquées une à la fois par le service
// worker (voir core/writer.ts). Les listes valent pour tous les comptes X ;
// les files, elles, sont propres à chacun.
import { accountStates, readStorage, scoped, stringArray, type SharedValues, type State } from "../../core/state.ts";
import { blockedByBarrage, resultOf } from "../blocking/queue.ts";
import type { NetworkId } from "../networks/networks.ts";
import { DEFAULT_HANDLES } from "./defaults.ts";
import {
  IMPORTED_NAME,
  MANUAL_ID,
  OFFICIAL_ID,
  cleanName,
  coversNetwork,
  effectiveHandles,
  officialList,
  otherActiveHandles,
  readListSync,
  readLists,
  uniqueName,
  withManualHandles,
  type ListDef,
} from "./lists.ts";
import {
  compareLists,
  confirmedGuard,
  guardReferences,
  renewGuard,
  settledGuard,
  type ListGuard,
  type PendingList,
  type Update,
} from "./remote.ts";

type Stored = Record<string, unknown>;

/**
 * Enregistre de nouvelles listes. Les comptes sortis de la liste effective
 * quittent les files de chaque compte X, sans rien débloquer. Avec `audit`, ceux
 * qui y entrent sans résultat connu seront vérifiés auprès de X : à l'import, à
 * l'activation d'une liste et à l'accueil. Une liste mise à jour et un ajout à la
 * main ne déclenchent pas de vérification : ces comptes-là ne sont bloqués qu'une
 * fois vus dans le fil. La liste collaborative a ses propres règles, voir replaceOfficial.
 */
async function saveLists(stored: Stored, lists: ListDef[], audit: boolean, extra: SharedValues = {}): Promise<void> {
  const states = accountStates(stored);
  const [shared] = states;
  const before = new Set(shared.handles);
  const effective = effectiveHandles(lists, "x", shared.official);
  const covered = new Set(effective);
  const off = new Set(shared.disabled);
  const values: Stored = { ...extra, lists };
  for (const own of states) {
    const fresh = audit
      ? effective.filter((h) => !before.has(h) && !off.has(h) && !resultOf(own.results, h))
      : [];
    Object.assign(
      values,
      scoped(own.prefix, {
        seen: own.seen.filter((h) => covered.has(h)),
        audit: [...new Set([...own.audit.filter((h) => covered.has(h)), ...fresh])],
      }),
    );
  }
  await chrome.storage.local.set(values);
}

function find(lists: readonly ListDef[], id: string): ListDef {
  const list = lists.find((l) => l.id === id);
  if (!list) throw new Error(`Liste inconnue : ${id}`);
  return list;
}

const replace = (lists: readonly ListDef[], next: ListDef): ListDef[] =>
  lists.map((list) => (list.id === next.id ? next : list));

/** Provenance d'une liste à importer, avec ses comptes. */
export type ImportedList = { handles: string[] } & ({ source: "github"; url: string } | { source: "file" });

export type NewList = ImportedList & { networks: NetworkId[] };

function importedList(lists: readonly ListDef[], list: NewList): ListDef {
  const addedAt = Date.now();
  const base = {
    id: crypto.randomUUID(),
    name: uniqueName(IMPORTED_NAME, lists.map((l) => l.name)),
    handles: list.handles,
    active: true,
    networks: list.networks,
    addedAt,
  };
  return list.source === "github"
    ? { ...base, source: "github", url: list.url, syncedAt: addedAt }
    : { ...base, source: "file" };
}

/** Ajoute une liste importée, active, sur ses réseaux. */
export async function addList(list: NewList): Promise<void> {
  const stored = await readStorage();
  const lists = readLists(stored.lists);
  await saveLists(stored, [...lists, importedList(lists, list)], true);
}

export async function setListActive(id: string, active: boolean): Promise<void> {
  const stored = await readStorage();
  const lists = readLists(stored.lists);
  await saveLists(stored, replace(lists, { ...find(lists, id), active }), active);
}

/** Une liste garde au moins un réseau : active sans réseau, elle ne couvrirait rien. */
export async function setListNetworks(id: string, networks: NetworkId[]): Promise<void> {
  if (!networks.length) throw new Error("Une liste s'applique sur au moins un réseau.");
  const stored = await readStorage();
  const lists = readLists(stored.lists);
  await saveLists(stored, replace(lists, { ...find(lists, id), networks }), true);
}

/** Renomme une liste, jamais la collaborative. Un nom déjà pris est numéroté. */
export async function renameList(id: string, raw: string): Promise<void> {
  if (id === OFFICIAL_ID) throw new Error("La liste collaborative ne peut pas être renommée.");
  const name = cleanName(raw);
  if (name === null) throw new Error("Nom de liste invalide.");
  const stored = await readStorage();
  const lists = readLists(stored.lists);
  const taken = lists.filter((l) => l.id !== id).map((l) => l.name);
  await chrome.storage.local.set({ lists: replace(lists, { ...find(lists, id), name: uniqueName(name, taken) }) });
}

/** Supprime une liste désactivée. Ses comptes déjà bloqués le restent. */
export async function removeList(id: string): Promise<void> {
  const stored = await readStorage();
  const lists = readLists(stored.lists);
  const list = find(lists, id);
  if (list.id === OFFICIAL_ID) throw new Error("La liste collaborative ne peut pas être supprimée.");
  if (list.active) throw new Error("Une liste active ne peut pas être supprimée.");
  const [shared] = accountStates(stored);
  const { [id]: _removed, ...listGuards } = shared.listGuards;
  const { [id]: _date, ...listSync } = readListSync(stored.listSync);
  await saveLists(stored, lists.filter((l) => l.id !== id), false, { listGuards, listSync });
}

/** Date de synchronisation de la liste `id` à écrire, les autres inchangées. */
const withSync = (stored: Stored, id: string, at: number): SharedValues => ({
  listSync: { ...readListSync(stored.listSync), [id]: at },
});

const sameHandles = (a: readonly string[] | null, b: readonly string[]): boolean =>
  a !== null && a.length === b.length && a.every((handle, i) => handle === b[i]);

/** Garde de la liste `id` à écrire, les autres inchangées. */
const withGuard = (shared: State, id: string, guard: ListGuard): SharedValues => ({
  listGuards: { ...shared.listGuards, [id]: guard },
});

/**
 * Remplace la liste collaborative par `next` : les comptes retirés que Barrage
 * a bloqués passent en file de déblocage, datés, sur chaque compte X où il les
 * a bloqués. `disabled` ne change pas : un compte hors liste y reste sans effet,
 * et une liste erronée puis corrigée ne fait pas perdre le choix de l'utilisateur.
 * @param states état de chaque compte X, voir accountStates : la liste et les
 *   réglages, communs, se lisent sur n'importe lequel
 */
export async function replaceOfficial(
  states: readonly State[],
  next: readonly string[],
  update: Extract<Update, { ok: true }>,
  extra: SharedValues,
): Promise<void> {
  const removed = new Set(update.removed);
  const listed = new Set(next);
  const at = Date.now();
  const values: Stored = { ...extra };
  for (const own of states) {
    // Un déblocage demandé à la main reste dû, voir unblockQueue.
    // Un compte remis dans la liste entre-temps n'est plus à débloquer, même si
    // la liste est désactivée plus tard.
    const retired = [...new Set([...own.retired, ...blockedByBarrage(update.removed, own.results)])].filter(
      (h) => !listed.has(h),
    );
    const retiredAt: Record<string, number> = Object.create(null);
    for (const handle of retired) retiredAt[handle] = own.retiredAt[handle] ?? at;
    Object.assign(values, scoped(own.prefix, { retired, retiredAt, seen: own.seen.filter((h) => !removed.has(h)) }));
  }
  await chrome.storage.local.set(values);
}

/** Copie de la liste intégrée, lue par toutes les surfaces, voir State.official. */
const BUNDLED_KEY = "bundled";

/**
 * Copie la liste intégrée à cette version, à chaque démarrage : les écritures
 * suivantes passent après elle dans la file, et un événement onInstalled manqué
 * se rattrape. Cas courant : la copie est à jour, rien d'autre n'est lu.
 *
 * Tant qu'aucune liste n'est reçue de GitHub, la liste intégrée fait foi : un
 * compte qu'elle ne contient plus est retiré comme il le serait de la liste en ligne.
 */
export async function syncBundled(): Promise<void> {
  const { [BUNDLED_KEY]: copy } = await chrome.storage.local.get(BUNDLED_KEY);
  const previous = Array.isArray(copy) ? stringArray(copy) : null;
  if (sameHandles(previous, DEFAULT_HANDLES)) return;
  const stored = await readStorage();
  const bundled = { [BUNDLED_KEY]: [...DEFAULT_HANDLES] };
  const states = accountStates(stored);
  const [shared] = states;
  if (previous && shared.remote === null) {
    const update = compareLists(previous, DEFAULT_HANDLES, otherActiveHandles(shared.lists, "x"));
    if (update.ok) return replaceOfficial(states, DEFAULT_HANDLES, update, bundled);
    console.warn("[Barrage] liste intégrée sans retrait :", update.reason);
  }
  await chrome.storage.local.set(bundled);
}

/**
 * Liste collaborative téléchargée : appliquée, ou mise de côté si elle s'écarte
 * trop de ses références. Identique à celle en place, seule sa date change, sauf
 * s'il reste un compte retiré à dater, voir unblockQueue.
 * @returns faux si la nouvelle liste est refusée
 */
export async function receiveOfficial(handles: string[], syncedAt: number): Promise<boolean> {
  const stored = await readStorage();
  const states = accountStates(stored);
  const [shared] = states;
  const guard = renewGuard(shared.listGuards[OFFICIAL_ID], shared.official, syncedAt);
  const covered = otherActiveHandles(shared.lists, "x");
  const update = compareLists(shared.official, handles, covered, guardReferences(guard));
  if (!update.ok) {
    console.warn("[Barrage] liste collaborative mise de côté :", update.reason);
    const pending: PendingList = { reason: update.reason, at: syncedAt, handles };
    await chrome.storage.local.set(withGuard(shared, OFFICIAL_ID, { ...guard, pending }));
    return false;
  }
  const settled = { ...withSync(stored, OFFICIAL_ID, syncedAt), ...withGuard(shared, OFFICIAL_ID, settledGuard(guard)) };
  const undated = states.some(({ retired, retiredAt }) => retired.some((h) => retiredAt[h] === undefined));
  if (sameHandles(shared.remote, handles) && !undated) await chrome.storage.local.set(settled);
  else await replaceOfficial(states, handles, update, { remote: handles, ...settled });
  return true;
}

/**
 * Remplace le contenu d'une liste GitHub après synchronisation, ou met la
 * nouvelle liste de côté si elle s'écarte trop de ses références. Les comptes
 * retirés restent bloqués.
 * @returns faux si la nouvelle liste est refusée
 */
export async function updateListHandles(id: string, handles: string[], syncedAt: number): Promise<boolean> {
  const stored = await readStorage();
  const lists = readLists(stored.lists);
  const list = lists.find((l) => l.id === id);
  if (!list) return false; // Supprimée pendant le téléchargement.
  const [shared] = accountStates(stored);
  const guard = renewGuard(shared.listGuards[id], list.handles, syncedAt);
  const update = compareLists(list.handles, handles, [], guardReferences(guard));
  if (!update.ok) {
    console.warn("[Barrage] liste mise de côté :", list.name, update.reason);
    const pending: PendingList = { reason: update.reason, at: syncedAt, handles };
    await chrome.storage.local.set(withGuard(shared, id, { ...guard, pending }));
    return false;
  }
  const settled = { ...withSync(stored, id, syncedAt), ...withGuard(shared, id, settledGuard(guard)) };
  if (sameHandles(list.handles, handles)) await chrome.storage.local.set(settled);
  else await saveLists(stored, replace(lists, { ...list, handles }), false, settled);
  return true;
}

/** Fichier en ligne invalide : rien à appliquer ni à accepter, mais les options le disent. */
export async function recordListRefusal(id: string, reason: string, at: number): Promise<void> {
  const [shared] = accountStates(await readStorage());
  const list = shared.lists.find((l) => l.id === id);
  if (!list) return; // Supprimée pendant le téléchargement.
  const current = id === OFFICIAL_ID ? shared.official : list.handles;
  const guard = renewGuard(shared.listGuards[id], current, at);
  await chrome.storage.local.set(withGuard(shared, id, { ...guard, pending: { reason, at } }));
}

/**
 * Applique la mise à jour mise de côté, confirmée dans les options. Son contenu
 * devient la référence, sans perdre le retour à la précédente. Les comptes
 * retirés de la liste collaborative attendent RETIRE_GRACE_MS comme les autres.
 */
export async function acceptPendingList(id: string): Promise<void> {
  const stored = await readStorage();
  const states = accountStates(stored);
  const [shared] = states;
  const guard = shared.listGuards[id];
  const handles = guard?.pending?.handles;
  if (!handles) throw new Error(`Aucune mise à jour à accepter : ${id}`);
  const at = Date.now();
  const extra = { ...withSync(stored, id, at), ...withGuard(shared, id, confirmedGuard(guard, handles, at)) };
  if (id === OFFICIAL_ID) {
    const update = compareLists(shared.official, handles, otherActiveHandles(shared.lists, "x"), [handles]);
    if (!update.ok) throw new Error(update.reason);
    await replaceOfficial(states, handles, update, { remote: handles, ...extra });
    return;
  }
  const lists = readLists(stored.lists);
  await saveLists(stored, replace(lists, { ...find(lists, id), handles }), false, extra);
}

/** `inactiveList` : nom réel de « Ma liste perso » si elle ne couvre pas X, ces comptes ne seront pas bloqués. */
export type AddResult = { added: string[]; existing: string[]; inactiveList: string | null };

/**
 * Ajoute des comptes normalisés à « Ma liste perso », créée au premier ajout.
 * Ceux déjà couverts, ou en double dans la saisie, ne sont ajoutés qu'une fois.
 */
export async function addHandles(handles: readonly string[]): Promise<AddResult> {
  const stored = await readStorage();
  const [{ handles: effective }] = accountStates(stored);
  const lists = readLists(stored.lists);
  const manual = lists.find((list) => list.id === MANUAL_ID);
  const known = new Set([...effective, ...(manual?.handles ?? [])]);
  const inactiveList = manual !== undefined && !coversNetwork(manual, "x") ? manual.name : null;
  const result: AddResult = { added: [], existing: [], inactiveList };
  for (const handle of new Set(handles)) {
    (known.has(handle) ? result.existing : result.added).push(handle);
  }
  if (result.added.length) await saveLists(stored, withManualHandles(lists, result.added, Date.now()), false);
  return result;
}

export type OnboardingChoice =
  | { kind: "official"; networks: NetworkId[] }
  | { kind: "list"; list: NewList }
  | { kind: "later" };

/** Enregistre le choix de l'accueil, qui ne revient plus. Un double clic n'importe rien deux fois. */
export async function completeOnboarding(choice: OnboardingChoice): Promise<void> {
  const stored = await readStorage();
  if (stored.onboarded === true) return;
  const lists = readLists(stored.lists);
  const addedAt = Date.now();
  const official =
    choice.kind === "official" ? officialList(true, choice.networks, addedAt) : officialList(false, ["x"], addedAt);
  const next = replace(lists, { ...find(lists, OFFICIAL_ID), ...official });
  if (choice.kind === "list") next.push(importedList(next, choice.list));
  // Une migration manquée ne perd rien : les comptes de l'ancienne clé `handles` sont repris.
  await saveLists(stored, withManualHandles(next, stringArray(stored.handles), addedAt), true, { onboarded: true });
  if (Array.isArray(stored.handles)) await chrome.storage.local.remove("handles");
}
