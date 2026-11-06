import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { installChrome } from "./helpers/chrome.ts";
import { getState } from "../src/core/state.ts";
import { awardBadges, earnedCount, hasBadge, nextBadge, nextStepText, shareText, shareUrl, BADGES } from "../src/features/badges/badges.ts";
import { dismissBadge, recordBlockSuccess, setNotifyBadges } from "../src/features/badges/store.ts";

let store: Record<string, unknown>;

beforeEach(() => {
  store = { legacy: "1", account: "1", accounts: { "1": {}, "2": {} } };
  installChrome(() => store);
});

test("un palier est attribué une fois, à son franchissement", () => {
  const first = awardBadges(1, {}, [], true, 5);
  assert.deepEqual({ ...first.badges }, { "1": 5 });
  assert.deepEqual(first.badgeQueue, [1]);
  const again = awardBadges(2, first.badges, [], true, 9);
  assert.deepEqual({ ...again.badges }, { "1": 5 });
  assert.deepEqual(again.badgeQueue, []);
});

test("plusieurs paliers franchis d'un coup : seul le plus haut est notifié", () => {
  const { badges, badgeQueue } = awardBadges(60, {}, [], true, 5);
  assert.equal(earnedCount(badges), 4);
  assert.deepEqual(badgeQueue, [50]);
});

test("sans notification de badge, le palier est attribué mais pas mis en file", () => {
  const { badges, badgeQueue } = awardBadges(1, {}, [], false, 5);
  assert.ok(hasBadge(badges, 1));
  assert.deepEqual(badgeQueue, []);
});

test("le compteur et les badges sont propres à chaque compte X", async () => {
  await recordBlockSuccess("1");
  await recordBlockSuccess("1");
  await recordBlockSuccess("2");
  const first = await getState("1");
  const second = await getState("2");
  assert.equal(first.blockCount, 2);
  assert.deepEqual(first.badgeQueue, [1]);
  assert.equal(second.blockCount, 1);
  assert.equal(store["acct:2/blockCount"], 1);
});

test("le dixième blocage ajoute le palier suivant à la file", async () => {
  for (let i = 0; i < 10; i++) await recordBlockSuccess("1");
  assert.deepEqual((await getState("1")).badgeQueue, [1, 10]);
  await dismissBadge(1, "1");
  assert.deepEqual((await getState("1")).badgeQueue, [10]);
});

test("couper les notifications de badge vide la file de chaque compte X", async () => {
  await recordBlockSuccess("1");
  await recordBlockSuccess("2");
  await setNotifyBadges(false);
  assert.deepEqual((await getState("1")).badgeQueue, []);
  assert.deepEqual((await getState("2")).badgeQueue, []);
  await recordBlockSuccess("1");
  assert.equal((await getState("1")).notifyBadges, false);
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
