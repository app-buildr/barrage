import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { getState, resultKey } from "../src/core/state.ts";
import { serveWrites } from "../src/core/writer.ts";
import { WRITES } from "../src/features/writes.ts";
import { HIDDEN_ATTR } from "../src/features/timeline/selectors.ts";
import { officialList } from "../src/features/lists/lists.ts";
import { installChrome, X_TAB } from "./helpers/chrome.ts";
import { FakeElement, fixture, installDom } from "./helpers/dom.ts";
import { installX, type FakeX } from "./helpers/x.ts";

let store: Record<string, unknown>;
let x: FakeX;
let tab = 0;

const settle = () => new Promise((resolve) => setTimeout(resolve, 3));

beforeEach(() => {
  store = {
    remote: ["liste1", "liste2"],
    lists: [officialList(true)],
    onboarded: true,
    account: "1",
    legacy: "1",
    accounts: { "1": {} },
  };
  installChrome(() => store, { sender: X_TAB });
  serveWrites(WRITES);
  x = installX();
});

/** Charge cette page dans un onglet neuf et laisse le fil la lire. */
async function open(name: string, path = "/home") {
  const root = installDom(fixture(name));
  (globalThis as any).location.pathname = path;
  const { watchTimeline } = await import(`../src/features/timeline/timeline.ts?tab=${++tab}`);
  watchTimeline();
  await settle();
  const hidden = (id: string) => (root.querySelector(`[id="${id}"]`) as FakeElement).hasAttribute(HIDDEN_ATTR);
  return { hidden, state: await getState("1") };
}

test("l'auteur d'un tweet est masqué et mis en file, un compte mentionné non", async () => {
  const { hidden, state } = await open("tweet");
  assert.equal(hidden("listed"), true);
  assert.equal(hidden("mention"), false);
  assert.deepEqual(state.seen, ["liste1"]);
});

test("l'auteur cité compte aussi, d'après le dernier @ de son bloc", async () => {
  const { hidden, state } = await open("quote");
  assert.equal(hidden("quote"), true);
  assert.deepEqual(state.seen, ["liste1"]);
});

test("un compte de la liste qui reposte le tweet d'un autre n'est pas visé par ce tweet", async () => {
  const { hidden, state } = await open("retweet");
  assert.equal(hidden("retweet"), false);
  assert.deepEqual(state.seen, []);
});

test("une suggestion vise son auteur, jamais un lien de sa bio", async () => {
  const { hidden, state } = await open("user-cell");
  assert.equal(hidden("bio"), false);
  assert.equal(hidden("listed"), true);
  assert.deepEqual(state.seen, ["liste2"]);
});

test("la page « Comptes bloqués » note le compte comme déjà bloqué, sans le masquer ni le mettre en file", async () => {
  const { hidden, state } = await open("blocked-page");
  assert.equal(hidden("blocked"), false);
  assert.deepEqual(state.seen, []);
  assert.equal(state.results.liste1?.state, "already_blocked");
});

test("le profil visité n'est pas masqué, le reste si, et son bouton Débloquer vaut « déjà bloqué »", async () => {
  const { hidden, state } = await open("profile", "/liste1");
  assert.equal(hidden("own"), false);
  assert.equal(hidden("other"), true);
  assert.equal(state.results.liste1?.state, "already_blocked");
});

test("un en-tête périmé pendant un changement de page ne prouve rien", async () => {
  const { state } = await open("profile-stale", "/liste1");
  assert.equal(state.results.liste1, undefined);
});

test("le bouton d'une suggestion ne vaut pas pour le profil visité", async () => {
  const { state } = await open("profile-suggestion", "/liste1");
  assert.equal(state.results.liste1, undefined);
});

test("un compte débloqué par Barrage depuis le chargement n'est pas repris pour un compte déjà bloqué", async () => {
  store[resultKey("liste1")] = { state: "unblocked", at: Date.now() };
  const { state } = await open("profile", "/liste1");
  assert.equal(state.results.liste1?.state, "unblocked");
});

test("un compte déjà bloqué par Barrage reste masqué sans revenir en file", async () => {
  store[resultKey("liste1")] = { state: "blocked", at: 1 };
  const { hidden, state } = await open("tweet");
  assert.equal(hidden("listed"), true);
  assert.deepEqual(state.seen, []);
});

test("un compte sur Off n'est ni masqué ni mis en file", async () => {
  store.disabled = ["liste1"];
  const { hidden, state } = await open("tweet");
  assert.equal(hidden("listed"), false);
  assert.deepEqual(state.seen, []);
});

test("après un changement de session, la page ne signale plus rien", async () => {
  const root = installDom(fixture("tweet"));
  const { watchTimeline } = await import(`../src/features/timeline/timeline.ts?tab=${++tab}`);
  // pageAccount a retenu le compte 1 au premier chargement de api.ts.
  x.cookies.twid = "u%3D2";
  watchTimeline();
  await settle();
  assert.equal(root.querySelector(`[${HIDDEN_ATTR}]`) !== null, true);
  assert.deepEqual((await getState("1")).seen, []);
  assert.deepEqual((await getState("2")).seen, []);
});

/** Onglet dont les passages n'ont lieu qu'à la demande, comme un onglet caché qu'on réaffiche. */
async function openHeld(name: string) {
  const root = installDom(fixture(name));
  (globalThis as any).location.pathname = "/home";
  let mutate: (records: unknown[]) => void = () => {};
  const frames: Array<() => void> = [];
  Object.assign(globalThis, {
    MutationObserver: class {
      constructor(callback: (records: unknown[]) => void) {
        mutate = callback;
      }
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: (task: () => void) => void frames.push(task),
  });
  const { watchTimeline } = await import(`../src/features/timeline/timeline.ts?tab=${++tab}`);
  watchTimeline();
  await settle();
  const drawFrames = () => {
    for (const frame of frames.splice(0)) frame();
  };
  drawFrames();
  const element = (id: string) => root.querySelector(`[id="${id}"]`) as FakeElement;
  /** `count` nœuds différents, tous détachés, signalés modifiés. */
  const mutations = (count: number) =>
    mutate(Array.from({ length: count }, () => ({ target: new FakeElement("div", new Map()), addedNodes: [] })));
  return { element, mutations, drawFrames };
}

test("des mutations sans passage ne s'accumulent pas : au-delà du plafond, tout est relu", async () => {
  const { element, mutations, drawFrames } = await openHeld("tweet");
  assert.equal(element("listed").hasAttribute(HIDDEN_ATTR), true);

  // X recycle ce nœud sans qu'aucune mutation ne le désigne.
  element("listed").removeAttribute(HIDDEN_ATTR);
  mutations(2000);
  drawFrames();
  assert.equal(element("listed").hasAttribute(HIDDEN_ATTR), false);

  mutations(2001);
  drawFrames();
  assert.equal(element("listed").hasAttribute(HIDDEN_ATTR), true);
});

test("sans liste active, ce qui était masqué réapparaît et les mutations ne lisent plus le document", async () => {
  const { element, mutations, drawFrames } = await openHeld("tweet");
  assert.equal(element("listed").hasAttribute(HIDDEN_ATTR), true);

  await chrome.storage.local.set({ lists: [officialList(false)] });
  await settle();
  drawFrames();
  assert.equal(element("listed").hasAttribute(HIDDEN_ATTR), false);

  const read = (globalThis as any).document.querySelectorAll;
  let reads = 0;
  (globalThis as any).document.querySelectorAll = (selector: string) => {
    reads++;
    return read(selector);
  };
  mutations(3);
  drawFrames();
  assert.equal(reads, 0);

  // La liste revient : la page est relue.
  await chrome.storage.local.set({ lists: [officialList(true)] });
  await settle();
  drawFrames();
  assert.equal(element("listed").hasAttribute(HIDDEN_ATTR), true);
});
