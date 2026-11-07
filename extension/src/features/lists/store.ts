// Écritures des listes de comptes, appliquées une à la fois par le service
// worker (voir core/writer.ts). Les listes valent pour tous les comptes X ;
// les files, elles, sont propres à chacun.
import { accountStates, readState, readStorage, scoped, stringArray, type SharedValues, type State } from "../../core/state.ts";
import { blockedBeforeBarrage, blockedByBarrage, listUpdate, resultOf } from "../blocking/queue.ts";
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
} from "./remote.ts";

type Stored = Record<string, unknown>;

/** Mise à jour d'une liste en ligne : comptes sortis et entrés dans la liste effective. */
type ListUpdate = { removed: readonly string[]; added: readonly string[]; from: string; at: number };

/** Mise à jour de la liste `from` : de `before` (liste effective en place) à `effective`. */
function listUpdateOf(before: readonly string[], effective: readonly string[], from: string): ListUpdate {
  const covered = new Set(effective);
  const known = new Set(before);
  return {
    removed: before.filter((h) => !covered.has(h)),
    added: effective.filter((h) => !known.has(h)),
    from,
    at: Date.now(),
  };
}

/** Ce qu'une nouvelle liste effective change pour un compte X. */
type ListChange = {
  /** Nouvelle liste effective de X. */
  covered: ReadonlySet<string>;
  /** Comptes à vérifier auprès de X, voir State.audit. */
  fresh: readonly string[];
  /** Mise à jour d'une liste en ligne, à présenter à l'utilisateur. */
  update?: ListUpdate;
};

type Tracked = { handles: string[]; at: Record<string, number>; from: Record<string, string> };

/**
 * Comptes présentés après une mise à jour (retirés ou ajoutés) : les anciens,
 * avec leur date et leur liste, plus les nouveaux, moins ceux que `keep` écarte.
 * null si rien ne change.
 */
function tracked(
  handles: readonly string[],
  at: Record<string, number>,
  from: Record<string, string>,
  fresh: readonly string[],
  update: ListUpdate | undefined,
  keep: (handle: string) => boolean,
): Tracked | null {
  const next = [...new Set([...handles, ...fresh])].filter(keep);
  if (next.length === handles.length && next.every((h, i) => h === handles[i])) return null;
  const known = new Set(handles);
  const result: Tracked = { handles: next, at: Object.create(null), from: Object.create(null) };
  for (const handle of next) {
    result.at[handle] = at[handle] ?? update?.at ?? Date.now();
    const list = from[handle] ?? (known.has(handle) ? undefined : update?.from);
    if (list !== undefined) result.from[handle] = list;
  }
  return result;
}

/**
 * Champs d'un compte X après un changement de liste. Les files ne gardent que
 * les comptes encore couverts : un compte sorti ne coûte plus de requête à X.
 * Après une mise à jour d'une liste en ligne, les comptes sortis sont présentés
 * à l'utilisateur (voir State.retired), sauf ceux qu'il bloquait avant Barrage :
 * c'est son choix, rien n'y change ; les comptes entrés aussi, pour information
 * (voir State.added). Un compte retiré puis remis, ou l'inverse, n'est présenté
 * que dans son dernier état.
 */
function changedValues(own: State, { covered, fresh, update }: ListChange): Stored {
  const values: Partial<State> = {
    seen: own.seen.filter((h) => covered.has(h)),
    audit: [...new Set([...own.audit.filter((h) => covered.has(h)), ...fresh])],
  };
  // `update` est calculée sur `covered` : seul le choix de l'utilisateur reste à écarter.
  const leaving = update ? update.removed.filter((h) => !blockedBeforeBarrage(own.results, h)) : [];
  // Les anciens comptes présentés suivent la nouvelle liste : un compte remis n'est plus retiré, et inversement.
  const retired = tracked(own.retired, own.retiredAt, own.retiredFrom, leaving, update, (h) => !covered.has(h));
  if (retired) Object.assign(values, { retired: retired.handles, retiredAt: retired.at, retiredFrom: retired.from });
  const entering = update ? update.added : [];
  const added = tracked(own.added, own.addedAt, own.addedFrom, entering, update, (h) => covered.has(h));
  if (added) Object.assign(values, { added: added.handles, addedAt: added.at, addedFrom: added.from });
  return scoped(own.prefix, values);
}

type SaveOptions = {
  /** Les comptes qui entrent dans la liste effective sans résultat connu seront vérifiés auprès de X. */
  audit: boolean;
  /** Mise à jour de cette liste : ceux qui en sortent ou y entrent sont présentés à l'utilisateur. */
  updated?: string;
  extra?: SharedValues;
};

/**
 * Enregistre de nouvelles listes. Les comptes sortis de la liste effective
 * quittent les files de chaque compte X, sans rien débloquer. Avec `audit`, ceux
 * qui y entrent sans résultat connu seront vérifiés auprès de X : à l'import, à
 * l'activation d'une liste, à l'ajout à la main et à l'accueil. Une liste mise
 * à jour ne déclenche pas de vérification : ses nouveaux comptes ne sont bloqués
 * qu'une fois vus dans le fil. La liste collaborative a ses propres règles, voir
 * replaceOfficial.
 */
async function saveLists(stored: Stored, lists: ListDef[], options: SaveOptions): Promise<void> {
  await chrome.storage.local.set(listValues(stored, lists, options));
}

/** Valeurs à écrire pour de nouvelles listes, voir saveLists. */
function listValues(stored: Stored, lists: ListDef[], { audit, updated, extra = {} }: SaveOptions): Stored {
  const states = accountStates(stored);
  const [shared] = states;
  const before = new Set(shared.handles);
  const effective = effectiveHandles(lists, "x", shared.official);
  const covered = new Set(effective);
  const off = new Set(shared.disabled);
  const update = updated ? listUpdateOf(shared.handles, effective, updated) : undefined;
  const values: Stored = { ...extra, lists };
  for (const own of states) {
    const fresh = audit
      ? effective.filter((h) => !before.has(h) && !off.has(h) && !resultOf(own.results, h))
      : [];
    Object.assign(values, changedValues(own, { covered, fresh, ...(update ? { update } : {}) }));
  }
  return values;
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
  await saveLists(stored, [...lists, importedList(lists, list)], { audit: true });
}

export async function setListActive(id: string, active: boolean): Promise<void> {
  const stored = await readStorage();
  const lists = readLists(stored.lists);
  await saveLists(stored, replace(lists, { ...find(lists, id), active }), { audit: active });
}

/** Une liste garde au moins un réseau : active sans réseau, elle ne couvrirait rien. */
export async function setListNetworks(id: string, networks: NetworkId[]): Promise<void> {
  if (!networks.length) throw new Error("Une liste s'applique sur au moins un réseau.");
  const stored = await readStorage();
  const lists = readLists(stored.lists);
  await saveLists(stored, replace(lists, { ...find(lists, id), networks }), { audit: true });
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
  await saveLists(stored, lists.filter((l) => l.id !== id), { audit: false, extra: { listGuards, listSync } });
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
 * Remplace la liste collaborative par `next`. Les comptes qui sortent de la
 * liste effective ou y entrent sont présentés à l'utilisateur sur chaque compte
 * X ; ceux que Barrage a bloqués parmi les sortis attendent qu'il choisisse de
 * les débloquer ou de les garder bloqués (voir State.retired). `disabled` ne change pas : un compte hors liste
 * y reste sans effet, et une liste erronée puis corrigée ne fait pas perdre le
 * choix de l'utilisateur.
 * @param states état de chaque compte X, voir accountStates : la liste et les
 *   réglages, communs, se lisent sur n'importe lequel
 */
export async function replaceOfficial(states: readonly [State, ...State[]], next: readonly string[], extra: SharedValues): Promise<void> {
  const [shared] = states;
  const effective = effectiveHandles(shared.lists, "x", next);
  const covered = new Set(effective);
  const update = listUpdateOf(shared.handles, effective, OFFICIAL_ID);
  const values: Stored = { ...extra };
  for (const own of states) Object.assign(values, changedValues(own, { covered, fresh: [], update }));
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
    if (update.ok) return replaceOfficial(states, DEFAULT_HANDLES, bundled);
    console.warn("[Barrage] liste intégrée sans retrait :", update.reason);
  }
  await chrome.storage.local.set(bundled);
}

/**
 * Liste collaborative téléchargée : appliquée, ou mise de côté si elle ajoute
 * trop de comptes à ses références. Identique à celle en place, seule sa date change.
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
  if (sameHandles(shared.remote, handles)) await chrome.storage.local.set(settled);
  else await replaceOfficial(states, handles, { remote: handles, ...settled });
  return true;
}

/**
 * Remplace le contenu d'une liste GitHub après synchronisation, ou met la
 * nouvelle liste de côté si elle ajoute trop de comptes à ses références. Les
 * comptes retirés restent bloqués jusqu'au choix de l'utilisateur.
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
  else await saveLists(stored, replace(lists, { ...list, handles }), { audit: false, updated: id, extra: settled });
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
 * retirés attendent le choix de l'utilisateur comme les autres.
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
    await replaceOfficial(states, handles, { remote: handles, ...extra });
    return;
  }
  const lists = readLists(stored.lists);
  await saveLists(stored, replace(lists, { ...find(lists, id), handles }), { audit: false, updated: id, extra });
}

/**
 * Validation de la carte « Mise à jour de vos listes », pour le compte X dont
 * la carte était affichée. Les comptes retirés quittent la carte : ceux de
 * `unblock` que Barrage a bloqués passent en file de déblocage ; ceux de `keep`
 * restent tels quels, bloqués (ils rejoignent les comptes hors liste) ou non
 * (Barrage ne les bloquera plus) ; ceux de `follow` rejoignent « Ma liste
 * perso », pour que Barrage continue à les bloquer. Les comptes ajoutés de
 * `acknowledged` quittent aussi la carte, comme les retirés qu'elle ne
 * présentait pas (bloqués par l'utilisateur avant Barrage). Un compte arrivé
 * pendant que l'utilisateur lisait reste présenté.
 *
 * Garder un compte, c'est vouloir qu'il soit bloqué : un compte gardé bloqué
 * (dans `keep` et bloqué par Barrage) ou suivi quitte `disabled`, sans quoi
 * l'interrupteur Off le ferait débloquer, ou jamais bloquer.
 *
 * Une seule écriture. « Ma liste perso » et `disabled` sont communs à tous les
 * comptes X : un compte suivi y est couvert partout, et ne figure donc plus
 * parmi les retirés des autres comptes X.
 * @throws si un compte figure dans deux choix, si `follow` vise un compte que
 *   Barrage a bloqué, ou une « Ma liste perso » qui ne couvre pas X : ces
 *   comptes ne seraient jamais bloqués
 */
export async function resolveListUpdate(
  account: string | null,
  unblock: readonly string[],
  keep: readonly string[],
  follow: readonly string[],
  acknowledged: readonly string[],
): Promise<void> {
  const chosen = [...unblock, ...keep, ...follow];
  if (new Set(chosen).size !== chosen.length) throw new Error("Un compte ne peut recevoir qu'un seul choix.");
  const stored = await readStorage();
  const own = readState(stored, account);
  if (blockedByBarrage(follow, own.results).length) {
    throw new Error("Un compte bloqué par Barrage se garde bloqué, il ne se suit pas.");
  }
  const pending = new Set(own.retired);
  const presented = new Set(listUpdate(own).retired);
  const done = new Set(chosen.filter((h) => pending.has(h)));
  const hidden = own.retired.filter((h) => !presented.has(h));
  const listed = new Set(own.added);
  const read = new Set(acknowledged.filter((h) => listed.has(h)));
  if (!done.size && !read.size) return;
  for (const handle of hidden) done.add(handle);

  const toFollow = follow.filter((h) => done.has(h));
  const lists = readLists(stored.lists);
  const manual = lists.find((list) => list.id === MANUAL_ID);
  if (toFollow.length && manual && !coversNetwork(manual, "x")) {
    throw new Error(`${manual.name} ne couvre pas X : ces comptes ne seraient pas bloqués.`);
  }

  const values: Partial<State> = {};
  // Comptes gardés pour être bloqués : l'interrupteur Off ne doit plus les écarter.
  const wanted = new Set([...blockedByBarrage(keep, own.results), ...toFollow].filter((h) => done.has(h)));
  const shared: Partial<State> = {};
  if (own.disabled.some((h) => wanted.has(h))) shared.disabled = own.disabled.filter((h) => !wanted.has(h));
  if (done.size) {
    const retired = own.retired.filter((h) => !done.has(h));
    // Seul un compte que Barrage a bloqué est débloqué : jamais un blocage de l'utilisateur, ni une requête inutile.
    const toUnblock = blockedByBarrage(unblock.filter((h) => done.has(h)), own.results);
    Object.assign(values, {
      retired,
      retiredAt: pick(own.retiredAt, retired),
      retiredFrom: pick(own.retiredFrom, retired),
      unblock: [...new Set([...own.unblock.filter((h) => !wanted.has(h)), ...toUnblock])],
    });
  }
  if (read.size) {
    const added = own.added.filter((h) => !read.has(h));
    Object.assign(values, { added, addedAt: pick(own.addedAt, added), addedFrom: pick(own.addedFrom, added) });
  }
  const ownValues = { ...shared, ...scoped(own.prefix, values) };
  if (!toFollow.length) {
    await chrome.storage.local.set(ownValues);
    return;
  }
  // Les listes et les files de chaque compte X sont recalculées d'après l'état
  // déjà validé : ce qu'elles écrivent pour ce compte part de ses nouvelles valeurs.
  const next = withManualHandles(lists, toFollow, Date.now());
  const listedValues = listValues({ ...stored, ...ownValues }, next, { audit: true });
  await chrome.storage.local.set({ ...ownValues, ...listedValues });
}

/** Les entrées de `record` pour ces comptes seulement. */
function pick<T>(record: Record<string, T>, handles: readonly string[]): Record<string, T> {
  const result: Record<string, T> = Object.create(null);
  for (const handle of handles) if (record[handle] !== undefined) result[handle] = record[handle];
  return result;
}

/** `inactiveList` : nom réel de « Ma liste perso » si elle ne couvre pas X, ces comptes ne seront pas bloqués. */
export type AddResult = { added: string[]; existing: string[]; inactiveList: string | null };

/**
 * Ajoute des comptes normalisés à « Ma liste perso », créée au premier ajout.
 * Ceux déjà couverts, ou en double dans la saisie, ne sont ajoutés qu'une fois.
 * Les nouveaux sont vérifiés auprès de X : un compte déjà bloqué y paraît bloqué
 * sans attendre d'être vu dans le fil.
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
  if (result.added.length) await saveLists(stored, withManualHandles(lists, result.added, Date.now()), { audit: true });
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
  await saveLists(stored, withManualHandles(next, stringArray(stored.handles), addedAt), { audit: true, extra: { onboarded: true } });
  if (Array.isArray(stored.handles)) await chrome.storage.local.remove("handles");
}
