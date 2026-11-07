import assert from "node:assert/strict";
import { test } from "node:test";
import { AVAILABLE_NETWORKS, ENGINE_NETWORK, X_HOME_URL, X_MATCHES, toNetworkId, xProfileUrl, xShareUrl } from "../src/features/networks/networks.ts";

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

test("les motifs d'hôtes et les adresses de X viennent de ses origines", () => {
  assert.deepEqual(X_MATCHES, ["https://x.com/*", "https://twitter.com/*"]);
  assert.equal(X_HOME_URL, "https://x.com/home");
  assert.equal(xProfileUrl("nom"), "https://x.com/nom");
  assert.equal(xProfileUrl("a/b"), "https://x.com/a%2Fb");
  assert.equal(xShareUrl("a b"), "https://x.com/intent/post?text=a%20b");
});
