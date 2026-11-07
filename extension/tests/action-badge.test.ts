import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, test } from "node:test";
import { officialList } from "../src/features/lists/lists.ts";
import { refreshBadge } from "../src/features/blocking/action-badge.ts";
import { installChrome } from "./helpers/chrome.ts";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const TITLE: string = manifest.action.default_title;

let store: Record<string, unknown>;
let shown: { text?: string; title?: string; color?: string };

beforeEach(() => {
  store = { remote: ["a", "b"], lists: [officialList(true)], onboarded: true };
  shown = {};
  installChrome(() => store, {
    action: {
      setBadgeTextColor: async () => {},
      setBadgeBackgroundColor: async ({ color }: { color: string }) => void (shown.color = color),
      setBadgeText: async ({ text }: { text: string }) => void (shown.text = text),
      setTitle: async ({ title }: { title: string }) => void (shown.title = title),
    },
    runtime: { getManifest: () => manifest },
  });
});

test("sans compte en attente, ni pastille ni autre titre que celui du manifest", async () => {
  assert.ok(TITLE);
  await refreshBadge();
  assert.deepEqual({ text: shown.text, title: shown.title }, { text: "", title: TITLE });
});

test("la pastille compte les comptes en attente, pas ceux déjà traités", async () => {
  store.seen = ["a", "b"];
  store["result:b"] = { state: "blocked", at: 1 };
  await refreshBadge();
  assert.equal(shown.text, "1");
});

test("au-delà de 999, la pastille reste courte", async () => {
  const handles = Array.from({ length: 1000 }, (_, i) => `c${i}`);
  store.remote = handles;
  store.seen = handles;
  await refreshBadge();
  assert.equal(shown.text, "999+");
});

test("une mise à jour disponible passe avant le compte, et se lit dans le titre", async () => {
  store.seen = ["a"];
  store.latestVersion = "99.0.0";
  await refreshBadge();
  assert.deepEqual(shown, { color: "#D7261E", text: "!", title: `${TITLE} (mise à jour disponible)` });
});

test("la version installée ne déclenche rien", async () => {
  store.latestVersion = manifest.version;
  await refreshBadge();
  assert.equal(shown.text, "");
});

test("des comptes retirés qui attendent un choix passent avant tout, en rouge", async () => {
  store.seen = ["a"];
  store.latestVersion = "99.0.0";
  store.retired = ["x1", "x2"];
  store["result:x1"] = { state: "blocked", at: 1 };
  await refreshBadge();
  assert.deepEqual(shown, { color: "#D7261E", text: "2", title: `${TITLE} (mise à jour des listes : 2 comptes retirés, à vérifier)` });
});

test("un compte bloqué par l'utilisateur avant Barrage ne compte pas dans la pastille", async () => {
  store.retired = ["moi", "x1"];
  store["result:moi"] = { state: "already_blocked", at: 1 };
  await refreshBadge();
  assert.equal(shown.text, "1");
});

test("retraits et ajouts s'additionnent sur la pastille, rouge tant qu'un retrait attend", async () => {
  store.retired = ["x1"];
  store["result:x1"] = { state: "blocked", at: 1 };
  store.added = ["n1", "n2"];
  await refreshBadge();
  assert.deepEqual({ text: shown.text, color: shown.color }, { text: "3", color: "#D7261E" });
});

test("des retraits sans aucun compte à débloquer donnent une pastille verte", async () => {
  store.retired = ["jamais_bloque"];
  store.added = ["n1"];
  await refreshBadge();
  assert.deepEqual(shown, { color: "#16704A", text: "2", title: `${TITLE} (mise à jour des listes : 1 compte retiré, 1 ajouté)` });
});

test("des ajouts seuls donnent une pastille verte, après une mise à jour de l'extension", async () => {
  store.added = ["n1", "n2"];
  await refreshBadge();
  assert.deepEqual(shown, { color: "#16704A", text: "2", title: `${TITLE} (mise à jour des listes : 2 comptes ajoutés)` });
  store.latestVersion = "99.0.0";
  await refreshBadge();
  assert.equal(shown.text, "!");
});
