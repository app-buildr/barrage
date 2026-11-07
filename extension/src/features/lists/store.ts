// Écritures des listes de comptes, appliquées une à la fois par le service
// worker (voir core/writer.ts). Les listes valent pour tous les comptes X ;
// les files, elles, sont propres à chacun.
import { accountStates, readStorage, scoped, type State } from "../../core/state.ts";
import { blockedByBarrage, resultOf } from "../blocking/queue.ts";
import type { NetworkId } from "../networks/networks.ts";
import {
  IMPORTED_NAME,
  OFFICIAL_ID,
  cleanName,
  effectiveHandles,
  officialList,
  otherActiveHandles,
  readLists,
  uniqueName,
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
 * qui y entrent sans résultat connu seront vérifiés auprès de X.
 */
async function saveLists(stored: Stored, lists: ListDef[], audit: boolean, extra: Stored = {}): Promise<void> {
  const states = accountStates(stored);
  const shared = states[0] as State;
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

export type NewList = { source: "github" | "file"; url?: string; handles: string[]; networks: NetworkId[] };

function importedList(lists: readonly ListDef[], list: NewList): ListDef {
  const addedAt = Date.now();
  return {
    id: crypto.randomUUID(),
    name: uniqueName(IMPORTED_NAME, lists.map((l) => l.name)),
    source: list.source,
    ...(list.url ? { url: list.url, syncedAt: addedAt } : {}),
    handles: list.handles,
    active: true,
    networks: list.networks,
    addedAt,
  };
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
  const { [id]: _removed, ...listGuards } = (accountStates(stored)[0] as State).listGuards;
  await saveLists(stored, lists.filter((l) => l.id !== id), false, { listGuards });
}

/** Garde de la liste `id` à écrire, les autres inchangées. */
const withGuard = (states: readonly State[], id: string, guard: ListGuard): Stored => ({
  listGuards: { ...(states[0] as State).listGuards, [id]: guard },
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
  extra: Stored,
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

/** Listes avec cette date de synchronisation pour la liste collaborative. */
const syncedOfficial = (shared: State, syncedAt: number): ListDef[] =>
  shared.lists.map((list) => (list.id === OFFICIAL_ID ? { ...list, syncedAt } : list));

/**
 * Liste collaborative téléchargée : appliquée, ou mise de côté si elle s'écarte
 * trop de ses références.
 * @returns faux si la nouvelle liste est refusée
 */
export async function receiveOfficial(handles: string[], syncedAt: number): Promise<boolean> {
  const states = accountStates(await readStorage());
  const shared = states[0] as State;
  const guard = renewGuard(shared.listGuards[OFFICIAL_ID], shared.official, syncedAt);
  const covered = otherActiveHandles(shared.lists, "x");
  const update = compareLists(shared.official, handles, covered, guardReferences(guard));
  if (!update.ok) {
    console.warn("[Barrage] liste collaborative mise de côté :", update.reason);
    const pending: PendingList = { reason: update.reason, at: syncedAt, handles };
    await chrome.storage.local.set(withGuard(states, OFFICIAL_ID, { ...guard, pending }));
    return false;
  }
  await replaceOfficial(states, handles, update, {
    remote: handles,
    lists: syncedOfficial(shared, syncedAt),
    ...withGuard(states, OFFICIAL_ID, settledGuard(guard)),
  });
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
  const states = accountStates(stored);
  const guard = renewGuard((states[0] as State).listGuards[id], list.handles, syncedAt);
  const update = compareLists(list.handles, handles, [], guardReferences(guard));
  if (!update.ok) {
    console.warn("[Barrage] liste mise de côté :", list.name, update.reason);
    const pending: PendingList = { reason: update.reason, at: syncedAt, handles };
    await chrome.storage.local.set(withGuard(states, id, { ...guard, pending }));
    return false;
  }
  await saveLists(stored, replace(lists, { ...list, handles, syncedAt }), false, withGuard(states, id, settledGuard(guard)));
  return true;
}

/** Fichier en ligne invalide : rien à appliquer ni à accepter, mais les options le disent. */
export async function recordListRefusal(id: string, reason: string, at: number): Promise<void> {
  const states = accountStates(await readStorage());
  const shared = states[0] as State;
  const list = shared.lists.find((l) => l.id === id);
  if (!list) return; // Supprimée pendant le téléchargement.
  const current = id === OFFICIAL_ID ? shared.official : list.handles;
  const guard = renewGuard(shared.listGuards[id], current, at);
  await chrome.storage.local.set(withGuard(states, id, { ...guard, pending: { reason, at } }));
}

/**
 * Applique la mise à jour mise de côté, confirmée dans les options. Son contenu
 * devient la référence, sans perdre le retour à la précédente. Les comptes
 * retirés de la liste collaborative attendent RETIRE_GRACE_MS comme les autres.
 */
export async function acceptPendingList(id: string): Promise<void> {
  const stored = await readStorage();
  const states = accountStates(stored);
  const shared = states[0] as State;
  const guard = shared.listGuards[id];
  const handles = guard?.pending?.handles;
  if (!handles) throw new Error(`Aucune mise à jour à accepter : ${id}`);
  const at = Date.now();
  const extra = withGuard(states, id, confirmedGuard(guard, handles, at));
  if (id === OFFICIAL_ID) {
    const update = compareLists(shared.official, handles, otherActiveHandles(shared.lists, "x"), [handles]);
    if (!update.ok) throw new Error(update.reason);
    await replaceOfficial(states, handles, update, { remote: handles, lists: syncedOfficial(shared, at), ...extra });
    return;
  }
  const lists = readLists(stored.lists);
  await saveLists(stored, replace(lists, { ...find(lists, id), handles, syncedAt: at }), false, extra);
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
  await saveLists(stored, next, true, { onboarded: true });
}
