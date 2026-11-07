// Fabriques partagées des tests. Les clés littérales (« acct:2/… ») restent dans
// les tests qui figent volontairement le format du stockage.
import { resultKey } from "../../src/core/state.ts";
import type { Result, ResultState } from "../../src/features/blocking/queue.ts";
import type { ListDef } from "../../src/features/lists/lists.ts";

/** Liste importée active sur X, modifiable par `extra`. */
export const listDef = (id: string, handles: string[], extra: Partial<ListDef> = {}) =>
  ({ id, name: id, source: "file", handles, active: true, networks: ["x"], addedAt: 0, ...extra }) as ListDef;

export const result = (state: ResultState, at = 1) => ({ state, at }) as Result;

/** Écrit des résultats dans le stockage d'un test, un par clé, sous le préfixe du compte X. */
export function putResults(store: Record<string, unknown>, results: Record<string, unknown>, prefix = ""): void {
  for (const [handle, value] of Object.entries(results)) store[resultKey(handle, prefix)] = value;
}
