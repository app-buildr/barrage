// Lignes du tableau des comptes : la liste effective, puis les comptes bloqués
// qui en sont sortis. Fonction pure, testée dans tests/multi-lists.test.ts.
import { offListHandles, unblockQueue, type State } from "../../core/state.ts";
import { actionsCapped, halted } from "../blocking/plan.ts";
import { resultOf } from "../blocking/queue.ts";
import { countCategories, describe, describeDisabled, type Category, type Counts, type Status } from "./status.ts";

export type Line = { handle: string; enabled: boolean; status: Status; category: Category; offList: boolean };

/** @param working un onglet x.com connecté peut traiter la file */
export function accountLines(state: State, working = true): Line[] {
  const queued = new Set(state.seen);
  const disabled = new Set(state.disabled);
  const unblocking = new Set(unblockQueue(state));
  const now = Date.now();
  const paused = !working || state.pauseUntil > now || halted(state.error, now) || actionsCapped(state.actions, now);
  const line = (handle: string, offList: boolean): Line => {
    const result = resultOf(state.results, handle);
    const enabled = !disabled.has(handle);
    const status = enabled ? describe(result, queued.has(handle), paused) : describeDisabled(result, unblocking.has(handle));
    return { handle, enabled, status, category: status.category, offList };
  };
  return [
    ...state.handles.map((handle) => line(handle, false)),
    ...offListHandles(state).map((handle) => line(handle, true)),
  ];
}

/** Compteurs des filtres (`all`) et de la progression (`listed`), sans les comptes hors liste. */
export function lineCounts(lines: readonly Line[]): { all: Counts; listed: Counts } {
  return {
    all: countCategories(lines.map((l) => l.status)),
    listed: countCategories(lines.filter((l) => !l.offList).map((l) => l.status)),
  };
}
