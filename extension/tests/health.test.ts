import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { HEALTH_PROBE_MS } from "../src/core/config.ts";
import { serveWrites } from "../src/core/writer.ts";
import { WRITES } from "../src/features/writes.ts";
import { healthVerdict, type PageView } from "../src/features/timeline/health.ts";
import { installChrome, X_TAB } from "./helpers/chrome.ts";
import { installDom } from "./helpers/dom.ts";
import { installX, type FakeX } from "./helpers/x.ts";

const FEED: PageView = {
  signedIn: true,
  accountReadable: true,
  onFeed: true,
  cells: 5,
  tweets: 5,
  userCells: 0,
  authors: 5,
};

test("un fil lisible va bien", () => {
  assert.equal(healthVerdict(FEED), null);
});

test("sans session, ou ailleurs que sur le fil visible, rien à conclure", () => {
  assert.equal(healthVerdict({ ...FEED, signedIn: false, accountReadable: false }), undefined);
  assert.equal(healthVerdict({ ...FEED, onFeed: false }), undefined);
  assert.equal(healthVerdict({ ...FEED, cells: 2, tweets: 0, authors: 0 }), undefined);
});

test("une session sans compte lisible : X a changé twid, où que soit la page", () => {
  assert.equal(healthVerdict({ ...FEED, accountReadable: false, onFeed: false }), "session");
});

test("des cellules sans tweet ni suggestion, ou des tweets sans auteur : X a changé son DOM", () => {
  assert.equal(healthVerdict({ ...FEED, tweets: 0, authors: 0 }), "timeline");
  assert.equal(healthVerdict({ ...FEED, authors: 0 }), "timeline");
});

test("un fil de suggestions, chez un compte neuf, n'alerte pas", () => {
  assert.equal(healthVerdict({ ...FEED, tweets: 0, authors: 0, userCells: 3 }), null);
});

let store: Record<string, unknown>;
let x: FakeX;
let tab = 0;

const CELLS = '<div data-testid="cellInnerDiv"></div>'.repeat(3);

/** Page affichée, avec ce qu'en lisent les sondes. */
function page(html: string): void {
  installDom(html);
  (globalThis as any).document.visibilityState = "visible";
}

async function settle(): Promise<void> {
  mock.timers.tick(HEALTH_PROBE_MS);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] });
  store = {};
  installChrome(() => store, { sender: X_TAB });
  serveWrites(WRITES);
  x = installX();
});

afterEach(() => {
  mock.timers.reset();
});

async function open(): Promise<void> {
  const health = await import(`../src/features/timeline/health.ts?tab=${++tab}`);
  health.watchHealth();
}

test("un twid illisible est signalé, et aucune requête ne part vers X", async () => {
  page(CELLS);
  x.cookies.twid = "v2:nouveau-format";
  await open();
  await settle();
  assert.equal(store.health, "session");
  assert.equal(x.requests.length, 0);
});

test("un fil illisible est signalé, puis oublié au retour de tweets lisibles", async () => {
  page(CELLS);
  await open();
  await settle();
  assert.equal(store.health, "timeline");

  page(`${CELLS}<article data-testid="tweet"><div data-testid="User-Name"></div></article>`);
  await open();
  await settle();
  assert.equal(store.health, null);
});

test("sans verdict, la sonde reprend au délai suivant", async () => {
  page("");
  await open();
  await settle();
  assert.equal(store.health, undefined);
  page(CELLS);
  await settle();
  assert.equal(store.health, "timeline");
});

test("une page saine n'écrit rien quand rien n'était signalé", async () => {
  page(`${CELLS}<article data-testid="tweet"><div data-testid="User-Name"></div></article>`);
  store.health = null;
  const set = chrome.storage.local.set;
  let writes = 0;
  (chrome.storage.local as any).set = (values: Record<string, unknown>) => {
    writes++;
    return set(values);
  };
  await open();
  await settle();
  assert.equal(writes, 0);
});
