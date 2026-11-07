// Mise à jour des listes : comptes retirés et ajoutés, présentés à
// l'utilisateur jusqu'à sa validation, voir State.retired, State.added et
// listUpdate. Fonctions pures, testées dans tests/list-update.test.ts.
import type { State } from "../../core/state.ts";
import { listUpdate, resultOf } from "../blocking/queue.ts";
import { OFFICIAL_ID, listName } from "../lists/lists.ts";
import { statusOf } from "./lines.ts";
import type { Status } from "./status.ts";

/** Nom affiché d'une liste supprimée depuis le changement. */
export const DELETED_LIST = "une liste supprimée";

export type UpdateLine = {
  handle: string;
  /** Nom de la liste d'où le compte a été retiré, ou où il a été ajouté. */
  from: string;
  /** État du compte, le même que dans le tableau, voir statusOf. */
  status: Status;
};

/**
 * `blocked` : retirés que Barrage a bloqués, à débloquer ou non. `notBlocked` :
 * retirés jamais bloqués (ou plus), à suivre ou non. `added` : ajoutés, pour
 * information. Un compte bloqué par l'utilisateur avant Barrage n'est dans
 * aucun groupe : c'est son choix, Barrage n'y touche pas.
 */
export type UpdateGroups = {
  blocked: UpdateLine[];
  notBlocked: UpdateLine[];
  added: UpdateLine[];
  /** Date du changement présenté le plus récent, ou null si aucun n'est daté. */
  at: number | null;
};

/** Nom affiché d'une liste, d'après son identifiant. Sans identifiant : la collaborative. */
function listLabel(lists: State["lists"], id: string | undefined): string {
  const list = lists.find((l) => l.id === (id ?? OFFICIAL_ID));
  return list ? listName(list) : DELETED_LIST;
}

/**
 * Comptes à présenter, par groupe, dans l'ordre des changements.
 * @param working un onglet x.com connecté peut traiter la file, voir statusOf
 */
export function updateGroups(state: State, working = true): UpdateGroups {
  const of = statusOf(state, working);
  const { retired, added } = listUpdate(state);
  const line = (handle: string, from: Record<string, string>): UpdateLine => ({
    handle,
    from: listLabel(state.lists, from[handle]),
    status: of(handle).status,
  });
  const groups: UpdateGroups = {
    blocked: [],
    notBlocked: [],
    added: added.map((h) => line(h, state.addedFrom)),
    at: lastUpdateAt(state, retired, added),
  };
  for (const handle of retired) {
    const target = resultOf(state.results, handle)?.state === "blocked" ? groups.blocked : groups.notBlocked;
    target.push(line(handle, state.retiredFrom));
  }
  return groups;
}

/** Date du changement le plus récent parmi ceux présentés, ou null si aucun n'est daté. */
function lastUpdateAt(
  state: Pick<State, "retiredAt" | "addedAt">,
  retired: readonly string[],
  added: readonly string[],
): number | null {
  const dates = [...retired.map((h) => state.retiredAt[h]), ...added.map((h) => state.addedAt[h])].filter(
    (at): at is number => typeof at === "number",
  );
  return dates.length ? Math.max(...dates) : null;
}

/** Validation à envoyer, voir resolveListUpdate. */
export type UpdateChoice = { unblock: string[]; keep: string[]; follow: string[] };

/**
 * Validation de la carte. Sans compte coché, c'est la recommandation de
 * Barrage : suivre la mise à jour, donc débloquer les comptes qu'il a bloqués
 * et ne plus bloquer les autres. Un compte coché est gardé : bloqué, il le
 * reste ; pas encore bloqué, il rejoint « Ma liste perso ».
 */
export function updateChoice(
  { blocked, notBlocked }: Pick<UpdateGroups, "blocked" | "notBlocked">,
  checked: ReadonlySet<string> = new Set(),
): UpdateChoice {
  const choice: UpdateChoice = { unblock: [], keep: [], follow: [] };
  for (const { handle } of blocked) (checked.has(handle) ? choice.keep : choice.unblock).push(handle);
  for (const { handle } of notBlocked) (checked.has(handle) ? choice.follow : choice.keep).push(handle);
  return choice;
}
