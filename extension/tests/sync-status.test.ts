import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { AUDIT_INTERVAL_MS } from "../src/core/config.ts";
import { getState, type State } from "../src/core/state.ts";
import { syncStatus } from "../src/features/accounts/sync-status.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { installChrome } from "./helpers/chrome.ts";

const NOW = 1_000_000_000;
let store: Record<string, unknown>;

beforeEach(() => {
  store = { remote: ["a", "b", "c", "d"], lists: [officialList(true)], onboarded: true };
  installChrome(() => store);
});

const status = async (overrides: Partial<State>, working: boolean | null = true) =>
  syncStatus({ ...(await getState()), account: "42", ...overrides }, working, NOW);

test("sans compte X vu sur x.com, la synchronisation attend", async () => {
  assert.deepEqual(await status({ account: null }), { kind: "no_account" });
});

test("tous les comptes désactivés : rien à synchroniser", async () => {
  assert.equal(await status({ account: null, disabled: ["a", "b", "c", "d"] }), null);
});

test("vérification terminée : rien à afficher", async () => {
  assert.equal(await status({ audit: [] }), null);
});

test("les comptes vérifiés se comptent parmi les comptes actifs", async () => {
  // « d » désactivé reste dans la file sans compter.
  const s = await status({ audit: ["c", "d"], disabled: ["d"] });
  assert.equal(s?.kind, "syncing");
  assert.deepEqual(s && "checked" in s && [s.checked, s.total], [2, 3]);
});

test("le premier paquet part tout de suite, les suivants s'espacent", async () => {
  const handles = Array.from({ length: 1426 }, (_, i) => `h${i}`);
  store.remote = handles;
  const s = await status({ audit: handles });
  // 15 paquets : le premier sans attendre, puis 14 écarts de 75 s.
  assert.deepEqual(s, { kind: "syncing", checked: 0, total: 1426, minutesLeft: 18, atLeast: false });
  const later = await status({ audit: handles, lookups: [NOW - AUDIT_INTERVAL_MS + 60_000] });
  assert.equal(later?.kind === "syncing" && later.minutesLeft, 19);
});

test("des blocages en attente partagent le budget : estimation minimale", async () => {
  const s = await status({ audit: ["c"], seen: ["a"] });
  assert.equal(s?.kind === "syncing" && s.atLeast, true);
});

test("la pause dit ce qui retient la vérification", async () => {
  const pause = async (overrides: Partial<State>, working: boolean | null = true) => {
    const s = await status({ audit: ["c"], ...overrides }, working);
    return s?.kind === "paused" ? s.pause : s?.kind;
  };
  assert.deepEqual(await pause({}, false), { reason: "no_tab" });
  assert.equal(await pause({}, null), "syncing");
  assert.deepEqual(await pause({ pauseUntil: NOW + 60_000 }), { reason: "limit", until: NOW + 60_000 });
  assert.deepEqual(await pause({ lookupPauseUntil: NOW + 90_000 }), { reason: "limit", until: NOW + 90_000 });
  const error = { message: "m", reason: "automation" as const, staleAt: Number.MAX_SAFE_INTEGER, at: NOW };
  assert.deepEqual(await pause({ error }, false), { reason: "error" });
});
