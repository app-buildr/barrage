// Listes de comptes : forme, lecture et liste effective. Fonctions pures,
// testées dans tests/multi-lists.test.ts.
import { LIST_NAME_MAX } from "../../core/config.ts";
import { AVAILABLE_NETWORKS, type NetworkId } from "../networks/networks.ts";

export const OFFICIAL_ID = "official";
export const MANUAL_ID = "manual";
/** Résolu à l'affichage, voir listName : celui stocké reste figé, la liste n'étant pas renommable. */
export const OFFICIAL_NAME = "Liste collaborative Barrage";
export const MANUAL_NAME = "Ma liste perso";
export const IMPORTED_NAME = "Nouvelle liste perso";

const SOURCES = ["official", "manual", "github", "file"] as const;

export type ListSource = (typeof SOURCES)[number];

type ListBase = {
  /** OFFICIAL_ID, MANUAL_ID, sinon identifiant généré. */
  id: string;
  name: string;
  /** Vide pour la liste collaborative, qui lit `remote` ou la liste intégrée. */
  handles: string[];
  active: boolean;
  /** Réseaux sur lesquels la liste s'applique. Conservés quand elle est désactivée. */
  networks: NetworkId[];
  /** Date d'ajout ou d'import, en millisecondes. */
  addedAt: number;
  /**
   * Dernière synchronisation réussie (collaborative, GitHub). Stockée à part,
   * voir ListSync : `readState` la rapporte ici pour l'affichage.
   */
  syncedAt?: number;
};

export type ListDef = ListBase & ({ source: "github"; url: string } | { source: "official" | "manual" | "file" });

/**
 * Dernières synchronisations, par identifiant de liste. Hors de `lists` : une
 * liste vérifiée sans changement ne relance aucun onglet.
 */
export type ListSync = Record<string, number>;

export function readListSync(value: unknown): ListSync {
  const sync: ListSync = Object.create(null);
  if (typeof value !== "object" || value === null) return sync;
  for (const [id, at] of Object.entries(value)) if (typeof at === "number") sync[id] = at;
  return sync;
}

/** Listes avec leur date de synchronisation. La date gardée dans `lists` vient d'une version antérieure, ou de l'import. */
export const withSyncDates = (lists: readonly ListDef[], sync: ListSync): ListDef[] =>
  lists.map((list) => (sync[list.id] === undefined ? list : { ...list, syncedAt: sync[list.id] as number }));

/** Réseaux proposés pour une liste : ceux où le blocage fonctionne. */
export const LIST_NETWORKS: readonly NetworkId[] = AVAILABLE_NETWORKS.map((n) => n.id);

/**
 * Liste collaborative tant que rien n'est enregistré : désactivée, pour que
 * rien ne soit masqué ni bloqué avant le choix fait à l'accueil.
 */
export function officialList(active = false, networks: NetworkId[] = ["x"], addedAt = 0): ListDef {
  return { id: OFFICIAL_ID, name: OFFICIAL_NAME, source: "official", handles: [], active, networks, addedAt };
}

/** « Ma liste perso », active sur X. */
export function manualList(handles: string[], addedAt: number, name = MANUAL_NAME): ListDef {
  return { id: MANUAL_ID, name, source: "manual", handles, active: true, networks: ["x"], addedAt };
}

/** Listes avec ces comptes dans « Ma liste perso », créée s'il le faut. */
export function withManualHandles(lists: readonly ListDef[], handles: readonly string[], at: number): ListDef[] {
  if (!handles.length) return [...lists];
  const manual = lists.find((list) => list.id === MANUAL_ID);
  if (manual) {
    const next = { ...manual, handles: [...new Set([...manual.handles, ...handles])] };
    return lists.map((list) => (list === manual ? next : list));
  }
  const fresh = manualList([...handles], at);
  return [...lists, { ...fresh, name: uniqueName(fresh.name, lists.map((list) => list.name)) }];
}

/** Nom affiché. Les autres noms sont des données de l'utilisateur, à ne jamais retraduire. */
export const listName = (list: ListDef): string => (list.id === OFFICIAL_ID ? OFFICIAL_NAME : list.name);

/** La liste s'applique sur ce réseau. */
export const coversNetwork = (list: ListDef, network: NetworkId): boolean =>
  list.active && list.networks.includes(network);

type StoredList = Partial<ListBase & { source: ListSource; url: string }>;

function readList(value: unknown): ListDef | null {
  const list = value as StoredList | null;
  if (typeof list !== "object" || list === null) return null;
  if (typeof list.id !== "string" || typeof list.name !== "string") return null;
  if (!SOURCES.includes(list.source as ListSource)) return null;
  const base: ListBase = {
    id: list.id,
    name: list.name,
    handles: Array.isArray(list.handles) ? list.handles.filter((h) => typeof h === "string") : [],
    active: list.active === true,
    networks: Array.isArray(list.networks) ? list.networks.filter((n) => LIST_NETWORKS.includes(n)) : [],
    addedAt: typeof list.addedAt === "number" ? list.addedAt : 0,
    ...(typeof list.syncedAt === "number" ? { syncedAt: list.syncedAt } : {}),
  };
  const source = list.source as ListSource;
  // Sans adresse lisible, une liste GitHub n'est plus téléchargée mais ses comptes restent.
  if (source === "github") return { ...base, source, url: typeof list.url === "string" ? list.url : "" };
  return { ...base, source };
}

/** Listes enregistrées, valeurs corrompues écartées. La collaborative est toujours présente. */
export function readLists(value: unknown): ListDef[] {
  const lists = (Array.isArray(value) ? value : []).map(readList).filter((list) => list !== null);
  return lists.some((list) => list.id === OFFICIAL_ID) ? lists : [officialList(), ...lists];
}

/** Comptes d'une liste. */
export function listHandles(list: ListDef, official: readonly string[]): readonly string[] {
  return list.id === OFFICIAL_ID ? official : list.handles;
}

/** Union, sans doublon, des listes actives qui couvrent ce réseau. */
export function effectiveHandles(lists: readonly ListDef[], network: NetworkId, official: readonly string[]): string[] {
  const covering = lists.filter((list) => coversNetwork(list, network));
  return [...new Set(covering.flatMap((list) => listHandles(list, official)))];
}

/** Comptes des listes actives sur ce réseau, liste collaborative exclue. */
export function otherActiveHandles(lists: readonly ListDef[], network: NetworkId): string[] {
  return effectiveHandles(lists.filter((list) => list.id !== OFFICIAL_ID), network, []);
}

/**
 * `name` s'il est libre, sinon le premier « name (n) » libre, à la manière du
 * Finder. Le résultat tient toujours dans LIST_NAME_MAX caractères.
 */
export function uniqueName(name: string, taken: readonly string[]): string {
  const names = new Set(taken);
  if (!names.has(name)) return name;
  for (let n = 1; ; n++) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, LIST_NAME_MAX - suffix.length).trimEnd() + suffix;
    if (!names.has(candidate)) return candidate;
  }
}

/** Nom saisi, espaces de début et de fin retirés, ou null s'il est vide ou trop long. */
export function cleanName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= LIST_NAME_MAX ? name : null;
}
