import assert from "node:assert/strict";
import { test } from "node:test";
import { AVAILABLE_NETWORKS, ENGINE_NETWORK, toNetworkId } from "../src/features/networks/networks.ts";

// L'état et le blocage sont ceux de X : un autre réseau ouvrable y afficherait
// les comptes de X, avec un bouton « Bloquer » qui agirait sur X.
test("seul le réseau doté d'un moteur de blocage est ouvrable", () => {
  assert.deepEqual(AVAILABLE_NETWORKS.map((n) => n.id), [ENGINE_NETWORK]);
});

test("une valeur inconnue revient à X", () => {
  assert.equal(toNetworkId("tiktok"), "tiktok");
  assert.equal(toNetworkId("inconnu"), "x");
  assert.equal(toNetworkId(null), "x");
});
