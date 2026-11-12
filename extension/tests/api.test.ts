import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { blockUser, lookupBlocking, unblockUser } from "../src/features/blocking/api.ts";
import { accountHandle, sessionId, signedIn } from "../src/features/x/session.ts";
import { apiError, BLOCK, installX, LOOKUP, lookupReply, UNBLOCK, type FakeX } from "./helpers/x.ts";

let x: FakeX;

beforeEach(() => {
  x = installX();
});

const sets = (reply: unknown) => {
  const { found, blocking } = reply as { found: Set<string>; blocking: Set<string> };
  return { found: [...found], blocking: [...blocking] };
};

test("le lookup demande les comptes en lecture seule et lit les blocages", async () => {
  x.routes[LOOKUP] = () => lookupReply(["A", "b"], ["b"]);
  assert.deepEqual(sets(await lookupBlocking(["a", "b", "c"])), { found: ["a", "b"], blocking: ["b"] });
  assert.equal(x.requests[0]?.method, "GET");
  assert.equal(x.requests[0]?.handle, "a,b,c");
});

test("X annonce un quota épuisé : le lookup rapporte son échéance", async () => {
  x.routes[LOOKUP] = () => ({
    ...(lookupReply(["a"]) as object),
    headers: { "x-rate-limit-remaining": "0", "x-rate-limit-reset": "4000000000" },
  });
  assert.equal(((await lookupBlocking(["a"])) as { quotaEnd?: number }).quotaEnd !== undefined, true);
  x.routes[LOOKUP] = () => ({ ...(lookupReply(["a"]) as object), headers: { "x-rate-limit-remaining": "3" } });
  assert.equal(Object.hasOwn(await lookupBlocking(["a"]), "quotaEnd"), false);
});

test("le code 17 dit qu'aucun compte du paquet n'existe", async () => {
  x.routes[LOOKUP] = () => apiError(17, 404);
  assert.deepEqual(sets(await lookupBlocking(["a"])), { found: [], blocking: [] });
});

test("sur le lookup, un code 34 reste un refus : il ne prouve pas que les comptes manquent", async () => {
  x.routes[LOOKUP] = () => apiError(34, 404);
  assert.equal(((await lookupBlocking(["a"])) as { kind: string }).kind, "failed");
});

test("un lookup qui répond autre chose qu'une liste est un refus", async () => {
  x.routes[LOOKUP] = () => ({ json: { pas: "une liste" } });
  assert.equal(((await lookupBlocking(["a"])) as { kind: string }).kind, "failed");
});

test("les réponses globales passent telles quelles", async () => {
  const cases = [
    [{ status: 200, text: "<html>" }, "broken"],
    [{ status: 403, text: "" }, "broken"],
    [{ status: 429, text: "" }, "rate_limited"],
    [apiError(226), "automation"],
    [apiError(326), "auth"],
    [{ status: 503, text: "" }, "network"],
    ["offline", "network"],
  ] as const;
  for (const [reply, kind] of cases) {
    x.routes[LOOKUP] = () => reply;
    x.routes[BLOCK] = () => reply;
    assert.equal(((await lookupBlocking(["a"])) as { kind: string }).kind, kind);
    assert.equal((await blockUser("a")).kind, kind);
  }
});

test("un blocage abouti rapporte le profil renvoyé par X, sans requête de plus", async () => {
  x.routes[BLOCK] = () => ({ json: { screen_name: "Nom", name: "Le Nom", description: "" } });
  const reply = await blockUser("nom");
  assert.equal(reply.kind, "ok");
  assert.equal(reply.kind === "ok" ? reply.profile?.name : null, "Le Nom");
  assert.equal(x.requests.length, 1);
});

test("sans cookie ct0, aucune requête ne part", async () => {
  delete x.cookies.ct0;
  assert.equal((await blockUser("a")).kind, "auth");
  assert.equal(((await lookupBlocking(["a"])) as { kind: string }).kind, "auth");
  assert.equal(x.requests.length, 0);
});

test("un POST porte la session, le jeton et le compte visé", async () => {
  const seen: RequestInit[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    seen.push(init);
    return real(url, init);
  }) as typeof fetch;
  assert.equal((await blockUser("nom")).kind, "ok");
  assert.equal((await unblockUser("nom")).kind, "ok");
  assert.deepEqual(x.requests.map((r) => r.path), [BLOCK, UNBLOCK]);
  const [request] = x.requests;
  assert.equal(request?.method, "POST");
  assert.equal(request?.body, "screen_name=nom&skip_status=1");
  assert.equal(request?.headers["x-csrf-token"], "jeton");
  assert.equal(request?.headers["x-twitter-auth-type"], "OAuth2Session");
  assert.match(request?.headers.authorization ?? "", /^Bearer /);
  assert.equal(seen[0]?.credentials, "include");
});

test("un code 34 sur un POST est confirmé par un lookup : compte disparu", async () => {
  x.routes[UNBLOCK] = () => apiError(34, 404);
  x.routes[LOOKUP] = () => apiError(17, 404);
  assert.equal((await unblockUser("a")).kind, "not_found");
});

test("un code 34 sur un compte qui existe : c'est la route qui a disparu", async () => {
  x.routes[UNBLOCK] = () => apiError(34, 404);
  assert.equal((await unblockUser("a")).kind, "broken");
});

test("un code 34 dont la confirmation échoue n'est pas conclu", async () => {
  x.routes[UNBLOCK] = () => apiError(34, 404);
  x.routes[LOOKUP] = () => apiError(999);
  assert.equal((await unblockUser("a")).kind, "broken");
  x.routes[LOOKUP] = () => ({ status: 429, text: "" });
  assert.equal((await unblockUser("a")).kind, "rate_limited");
});

test("les codes 50 et 63 valent « introuvable » sans vérification", async () => {
  x.routes[BLOCK] = () => apiError(63);
  assert.equal((await blockUser("a")).kind, "not_found");
  assert.equal(x.requests.length, 1);
});

test("la session se lit dans les cookies, sans stocker le jeton", async () => {
  const id = await sessionId();
  assert.match(id ?? "", /^[0-9a-f]{16}$/);
  x.cookies.ct0 = "autre";
  assert.notEqual(await sessionId(), id);
  delete x.cookies.ct0;
  assert.equal(await sessionId(), null);
});

test("connecté d'après twid ou le bouton de compte", () => {
  assert.equal(signedIn(), true);
  delete x.cookies.twid;
  assert.equal(signedIn(), false);
  (globalThis as any).document.querySelector = () => ({ textContent: "Nom @Moi" });
  assert.equal(signedIn(), true);
  assert.equal(accountHandle(), "moi");
});

test("une requête sans réponse est abandonnée au bout du délai, comme une coupure réseau", async () => {
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    signal = init.signal;
    throw new DOMException("délai dépassé", "TimeoutError");
  }) as unknown as typeof fetch;
  assert.equal((await blockUser("a")).kind, "network");
  assert.ok(signal instanceof AbortSignal);
});
