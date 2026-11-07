import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { PING } from "../src/core/messages.ts";
import { installChrome } from "./helpers/chrome.ts";
import { installX } from "./helpers/x.ts";

let tabs: Array<{ id?: number }>;
let created: Array<{ url: string; active: boolean }>;
let closed: Set<number>;
/** Réponse des onglets aux pings, undefined pour un onglet sans script vivant. */
let reply: { session: boolean } | undefined;
let load = 0;

/** Module neuf : ses mémoires d'onglet ouvert repartent de zéro. */
const fresh = () => import(`../src/features/blocking/x-tab.ts?load=${++load}`);

beforeEach(() => {
  tabs = [];
  created = [];
  closed = new Set();
  reply = undefined;
  installX();
  installChrome(() => ({}), {
    tabs: {
      query: async () => tabs,
      sendMessage: async (_id: number, message: { type: string }) => {
        assert.equal(message.type, PING);
        return reply;
      },
      create: async (options: { url: string; active: boolean }) => {
        created.push(options);
        return { id: 100 + created.length };
      },
      get: async (id: number) => {
        if (closed.has(id)) throw new Error("onglet fermé");
        return { id };
      },
    },
  });
});

test("plusieurs clics rapprochés n'ouvrent qu'un onglet, en arrière-plan", async () => {
  const { wakeXTab } = await fresh();
  await Promise.all([wakeXTab(), wakeXTab(), wakeXTab()]);
  assert.deepEqual(created, [{ url: "https://x.com/home", active: false }]);
});

test("un onglet ouvert, encore en chargement, n'en fait pas ouvrir un autre", async () => {
  const { wakeXTab } = await fresh();
  await wakeXTab();
  await wakeXTab();
  assert.equal(created.length, 1);
});

test("un onglet ouvert puis fermé est remplacé", async () => {
  const { wakeXTab } = await fresh();
  await wakeXTab();
  closed.add(101);
  await wakeXTab();
  assert.equal(created.length, 2);
});

test("un onglet vivant suffit, connecté ou non", async () => {
  const { wakeXTab, xTabStatus } = await fresh();
  tabs = [{ id: 1 }, {}];
  reply = { session: false };
  assert.equal(await xTabStatus(), "logged_out");
  await wakeXTab();
  reply = { session: true };
  assert.equal(await xTabStatus(), "connected");
  await wakeXTab();
  assert.deepEqual(created, []);
});

test("un onglet sans script vivant ne compte pas", async () => {
  const { wakeXTab, xTabStatus } = await fresh();
  tabs = [{ id: 1 }];
  assert.equal(await xTabStatus(), "none");
  await wakeXTab();
  assert.equal(created.length, 1);
});
