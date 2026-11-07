import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlockingError } from "../src/core/state.ts";
import { describe } from "../src/features/accounts/status.ts";
import { errorText, errorTitle, resultText } from "../src/features/blocking/error-text.ts";

const error = (values: Partial<BlockingError>): BlockingError => ({ reason: "other", staleAt: 1, ...values });

test("un résultat stocké avec un code se lit au moment de l'affichage", () => {
  assert.equal(resultText({ state: "not_found", at: 1, code: "account_suspended" }), "Compte suspendu.");
  assert.equal(resultText({ state: "failed", at: 1, code: "refused", param: 139 }), "Refus de X (code 139).");
});

test("un résultat d'une version antérieure garde son texte stocké", () => {
  assert.equal(resultText({ state: "failed", at: 1, message: "Refus ancien." }), "Refus ancien.");
  assert.equal(describe({ state: "failed", at: 1, attempts: 3, message: "Refus ancien." }, false).label, "Échec : Refus ancien.");
  assert.equal(describe({ state: "not_found", at: 1, message: "Compte introuvable." }, false).label, "Compte introuvable.");
});

test("un code inconnu de cette version retombe sur le texte stocké, ou rien", () => {
  const unknown = { state: "failed", at: 1, code: "constructor" } as never;
  assert.equal(resultText(unknown), undefined);
  assert.equal(describe({ state: "failed", at: 1, attempts: 3 }, false).label, "Échec : refus de X");
});

test("une erreur d'une version antérieure garde son texte stocké", () => {
  assert.equal(errorText(error({ message: "Réseau coupé. Nouvel essai dans une minute." })), "Réseau coupé. Nouvel essai dans une minute.");
});

test("le texte d'une erreur dépend de ce que faisait le traitement", () => {
  assert.equal(errorText(error({ code: "network_down", context: "retry" })), "Réseau indisponible. Nouvel essai dans 1 minute.");
  assert.match(errorText(error({ code: "unreadable_reply", context: "stopped" })), /^Réponse de X illisible\. Barrage s'est arrêté/);
  assert.match(errorText(error({ code: "refused", param: 9, context: "check" })), /^Vérification impossible : Refus de X \(code 9\)\. .* dans 15 minutes au plus tôt\.$/);
  assert.match(errorText(error({ code: "refused", param: 9, context: { refusals: 3 } })), /^3 comptes refusés de suite \(Refus de X \(code 9\)\)\. Barrage/);
  assert.equal(errorText(error({ code: "account_missing", context: { unblock: "a" } })), "Déblocage de @a impossible : Compte introuvable.");
});

test("le titre ne parle de session que si elle est en cause", () => {
  assert.equal(errorTitle(error({ reason: "auth", code: "session_expired" })), "Session X expirée");
  assert.equal(errorTitle(error({ reason: "auth", code: "x_account_locked" })), "Connexion à X impossible");
  // Message d'une version antérieure : la cause n'est plus connue.
  assert.equal(errorTitle(error({ reason: "auth", message: "Votre compte X est suspendu." })), "Connexion à X impossible");
  assert.equal(errorTitle(error({ reason: "network", code: "network_down" })), "Réseau indisponible");
});
