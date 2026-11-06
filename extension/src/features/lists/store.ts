// Écritures des listes de comptes, appliquées une à la fois par le service
// worker (voir core/writer.ts). Les listes valent pour tous les comptes X ;
// les files, elles, sont propres à chacun.
import { accountStates, readStorage, scoped, type State } from "../../core/state.ts";
import { resultOf } from "../blocking/queue.ts";
import type { NetworkId } from "../networks/networks.ts";
import {
  IMPORTED_NAME,
  OFFICIAL_ID,
  cleanName,
  effectiveHandles,
  officialList,
  readLists,
  uniqueName,
  type ListDef,
} from "./lists.ts";
import { compareLists } from "./remote.ts";

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
  await saveLists(stored, lists.filter((l) => l.id !== id), false);
}

/**
 * Remplace le contenu d'une liste GitHub après synchronisation. Ignoré si elle
 * retire trop de comptes d'un coup. Les comptes retirés restent bloqués.
 * @returns faux si la nouvelle liste est refusée
 */
export async function updateListHandles(id: string, handles: string[], syncedAt: number): Promise<boolean> {
  const stored = await readStorage();
  const lists = readLists(stored.lists);
  const list = lists.find((l) => l.id === id);
  if (!list) return false; // Supprimée pendant le téléchargement.
  const update = compareLists(list.handles, handles, []);
  if (!update.ok) {
    console.warn("[Barrage] liste ignorée :", list.name, update.reason);
    return false;
  }
  await saveLists(stored, replace(lists, { ...list, handles, syncedAt }), false);
  return true;
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
