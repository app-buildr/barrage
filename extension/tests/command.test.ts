import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { UNDO_LAST, isUndoLastRequest } from "../src/core/messages.ts";
import { UNDO_COMMAND, serveCommands } from "../src/features/notifications/command.ts";
import { installChrome } from "./helpers/chrome.ts";

/** Faux chrome.commands et chrome.tabs : `tabs` est l'onglet actif, s'il est sur x.com. */
function setup(tabs: Array<{ id?: number }>) {
  const sent: Array<{ id: number; message: unknown }> = [];
  let fire: (command: string) => void = () => {};
  installChrome(() => ({}), {
    commands: { onCommand: { addListener: (listener: typeof fire) => (fire = listener) } },
    tabs: {
      query: async () => tabs,
      sendMessage: async (id: number, message: unknown) => void sent.push({ id, message }),
    },
  });
  serveCommands();
  return { sent, fire: (command: string) => fire(command) };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 1));

test("le raccourci déclaré dans le manifest est celui qu'écoute le service worker", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.ok(manifest.commands[UNDO_COMMAND]);
});

test("le raccourci demande l'annulation à l'onglet x.com actif", async () => {
  const { sent, fire } = setup([{ id: 7 }]);
  fire(UNDO_COMMAND);
  await settled();
  assert.deepEqual(sent, [{ id: 7, message: { type: UNDO_LAST } }]);
  assert.equal(isUndoLastRequest(sent[0]?.message), true);
});

test("hors de x.com, ou pour une autre commande, rien n'est envoyé", async () => {
  const away = setup([]);
  away.fire(UNDO_COMMAND);
  const other = setup([{ id: 7 }]);
  other.fire("autre");
  await settled();
  assert.deepEqual([...away.sent, ...other.sent], []);
});
