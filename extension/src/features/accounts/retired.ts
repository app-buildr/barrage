// Comptes retirés d'une liste qui attendent le choix de l'utilisateur, voir
// State.retired. Fonctions pures, testées dans tests/retired.test.ts.
import type { State } from "../../core/state.ts";
import { isBlocked, resultOf } from "../blocking/queue.ts";
import { OFFICIAL_ID, listName } from "../lists/lists.ts";

/** Nom affiché d'une liste supprimée depuis le retrait. */
export const DELETED_LIST = "une liste supprimée";

export type RetiredLine = {
  handle: string;
  /** Nom de la liste d'où le compte a été retiré. */
  from: string;
  /** Encore bloqué sur X d'après Barrage. */
  blocked: boolean;
};

type RetiredState = Pick<State, "retired" | "retiredAt" | "retiredFrom" | "lists" | "results">;

/** Comptes à présenter, dans l'ordre des retraits. */
export function retiredLines({ retired, retiredFrom, lists, results }: RetiredState): RetiredLine[] {
  return retired.map((handle) => {
    const id = retiredFrom[handle] ?? OFFICIAL_ID;
    const list = lists.find((l) => l.id === id);
    return { handle, from: list ? listName(list) : DELETED_LIST, blocked: isBlocked(resultOf(results, handle)) };
  });
}

/** Date du retrait le plus récent, ou null si aucun n'est daté. */
export function lastRetiredAt({ retired, retiredAt }: Pick<State, "retired" | "retiredAt">): number | null {
  const dates = retired.map((h) => retiredAt[h]).filter((at): at is number => typeof at === "number");
  return dates.length ? Math.max(...dates) : null;
}

/** Choix à enregistrer : les comptes cochés sont à débloquer, les autres restent bloqués. */
export function retiredChoice(
  retired: readonly string[],
  unchecked: ReadonlySet<string>,
): { unblock: string[]; keep: string[] } {
  return { unblock: retired.filter((h) => !unchecked.has(h)), keep: retired.filter((h) => unchecked.has(h)) };
}
