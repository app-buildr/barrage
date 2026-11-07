import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { installChrome } from "./helpers/chrome.ts";
import { getState, resultKey } from "../src/core/state.ts";
import { awardBadges, badgeDescription, earnedCount, nextBadge, nextStepText, pendingBadge, shareText, shareUrl, BADGES } from "../src/features/badges/badges.ts";
import { dismissBadge, recordBlockSuccess, setNotifyBadges, syncAllBadges, syncBadges } from "../src/features/badges/store.ts";
import { markAlreadyBlocked } from "../src/features/blocking/store.ts";
import { manualList } from "../src/features/lists/lists.ts";

let store: Record<string, unknown>;

beforeEach(() => {
  store = { legacy: "1", account: "1", accounts: { "1": {}, "2": {} } };
  installChrome(() => store);
});

test("un palier est attribué une fois, à son franchissement", () => {
  const first = awardBadges(1, {}, 5);
  assert.deepEqual({ ...first }, { "1": 5 });
  assert.deepEqual({ ...awardBadges(2, first, 9) }, { "1": 5 });
});

test("seul le plus haut badge obtenu est à notifier, tant qu'il ne l'a pas été", () => {
  const badges = awardBadges(255, {}, 5);
  assert.equal(earnedCount(badges), 6);
  assert.equal(pendingBadge(badges, 0), 250);
  assert.equal(pendingBadge(badges, 100), 250);
  assert.equal(pendingBadge(badges, 250), null);
  assert.equal(pendingBadge({}, 0), null);
});

test("le compteur et les badges sont propres à chaque compte X", async () => {
  await recordBlockSuccess("1");
  await recordBlockSuccess("1");
  await recordBlockSuccess("2");
  const first = await getState("1");
  const second = await getState("2");
  assert.equal(first.blockCount, 2);
  assert.equal(pendingBadge(first.badges, first.badgeNotified), 1);
  assert.equal(second.blockCount, 1);
  assert.equal(store["acct:2/blockCount"], 1);
});

test("une notification fermée ne revient plus, le palier suivant si", async () => {
  await recordBlockSuccess("1");
  await dismissBadge(1, "1");
  let state = await getState("1");
  assert.equal(pendingBadge(state.badges, state.badgeNotified), null);
  for (let i = 0; i < 9; i++) await recordBlockSuccess("1");
  state = await getState("1");
  assert.equal(pendingBadge(state.badges, state.badgeNotified), 10);
  assert.equal((await getState("2")).badgeNotified, 0);
});

test("fermer une notification dépassée ne fait pas redescendre le palier notifié", async () => {
  await dismissBadge(25, "1");
  await dismissBadge(10, "1");
  assert.equal((await getState("1")).badgeNotified, 25);
});

test("le réglage des notifications de badge est actif par défaut et vaut pour tous les comptes X", async () => {
  assert.equal((await getState("1")).notifyBadges, true);
  await setNotifyBadges(false);
  assert.equal((await getState("1")).notifyBadges, false);
  assert.equal((await getState("2")).notifyBadges, false);
});

test("des badges déjà à jour ne provoquent aucune écriture", async () => {
  store[resultKey("a")] = { state: "blocked", at: 1 };
  await syncBadges("1");
  const set = chrome.storage.local.set;
  let writes = 0;
  (chrome.storage.local as any).set = async () => void writes++;
  await syncBadges("1");
  await syncAllBadges();
  (chrome.storage.local as any).set = set;
  assert.equal(writes, 0);
});

test("le palier suivant se lit depuis le compteur", () => {
  assert.equal(nextBadge(0)?.palier, 1);
  assert.equal(nextBadge(215)?.name, "Forteresse");
  assert.equal(nextBadge(1000), undefined);
  assert.equal(nextStepText(100), "Prochain palier : Forteresse, à 250.");
  assert.equal(nextStepText(1000), "Vous avez atteint le dernier palier.");
});

test("le texte de partage suit la spec, palier 1 compris", () => {
  const [first, , , , fifth] = BADGES;
  assert.equal(
    shareText(first!),
    "J'ai bloqué mon premier compte avec @BarrageApp 🪨 Vos réseaux sociaux, vos règles. app-buildr.github.io/barrage",
  );
  assert.equal(
    shareText(fifth!),
    "J'ai débloqué le badge Barrage ✊ : 100 comptes bloqués avec @BarrageApp. Vos réseaux sociaux, vos règles. app-buildr.github.io/barrage",
  );
  const url = new URL(shareUrl(fifth!));
  assert.equal(url.origin + url.pathname, "https://x.com/intent/post");
  assert.equal(url.searchParams.get("text"), shareText(fifth!));
});

test("le rattrapage ne fait jamais baisser le compteur", async () => {
  store["acct:2/blockCount"] = 12;
  store[resultKey("a", "acct:2/")] = { state: "already_blocked", at: 1 };
  await syncAllBadges();
  assert.equal((await getState("2")).blockCount, 12);
});

test("une installation déjà en 1.4.0 rattrape ses badges à la mise à jour", async () => {
  store["acct:2/blockCount"] = 7;
  store["acct:2/badges"] = { "1": 3 };
  for (let i = 0; i < 25; i++) store[resultKey(`c${i}`, "acct:2/")] = { state: "already_blocked", at: 1 };
  await syncAllBadges();
  const state = await getState("2");
  assert.equal(state.blockCount, 25);
  assert.deepEqual(Object.keys(state.badges), ["1", "10", "25"]);
  assert.equal(pendingBadge(state.badges, state.badgeNotified), 25);
});

test("un compte repéré comme déjà bloqué compte pour les badges", async () => {
  store.lists = [manualList(["a"], 1)];
  await markAlreadyBlocked(["a"], "2");
  const state = await getState("2");
  assert.equal(state.blockCount, 1);
  assert.equal(pendingBadge(state.badges, state.badgeNotified), 1);
});

test("la description d'un badge suit son palier", () => {
  assert.equal(badgeDescription(1), "Votre premier compte bloqué");
  assert.equal(badgeDescription(10), "10 comptes bloqués");
  assert.equal(badgeDescription(1000), "1\u202f000 comptes bloqués");
});
