// Appels à l'API interne de X, celle qu'utilise le site lui-même.
// C'est le point qui casse si X change son API : un seul fichier à relire.
import { X_REQUEST_TIMEOUT_MS } from "../../core/config.ts";
import { readCsrfToken } from "../x/session.ts";
import {
  classify,
  failureOf,
  noUserMatch,
  quotaEnd,
  readLookup,
  routeMaybeGone,
  type Lookup,
  type Outcome,
} from "./outcome.ts";

/**
 * Jeton public du client web de X, identique pour tous les visiteurs et présent
 * dans le code du site. Il identifie l'application, pas l'utilisateur : c'est
 * le cookie de session qui porte l'identité.
 */
const WEB_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const BLOCK_PATH = "/i/api/1.1/blocks/create.json";
const UNBLOCK_PATH = "/i/api/1.1/blocks/destroy.json";
const LOOKUP_PATH = "/i/api/1.1/friendships/lookup.json";

/**
 * Requête de même origine que la page : le cookie de session part avec.
 * Renvoie l'issue classée, le corps pour qui doit le lire, et la fin du quota
 * si X annonce qu'il est épuisé.
 */
async function call(path: string, init: RequestInit): Promise<{ outcome: Outcome; body?: unknown; quota?: number | null }> {
  const csrf = readCsrfToken();
  if (!csrf) return { outcome: { kind: "auth", code: "session_missing" } };
  let response: Response;
  try {
    response = await fetch(location.origin + path, {
      ...init,
      credentials: "include",
      // Sans réponse, l'onglet garderait le verrou : aucun autre ne prendrait la file.
      signal: AbortSignal.timeout(X_REQUEST_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${WEB_BEARER}`,
        "content-type": "application/x-www-form-urlencoded",
        "x-csrf-token": csrf,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
      },
    });
  } catch {
    return { outcome: { kind: "network", code: "network_down" } };
  }
  const body: unknown = await response.json().catch(() => null);
  const reset = response.headers.get("x-rate-limit-reset");
  const outcome = classify(response.status, body, reset, Date.now());
  return { outcome, body, quota: quotaEnd(response.headers.get("x-rate-limit-remaining"), reset, Date.now()) };
}

/** @param beforeLookup appelé avant la vérification d'une route disparue, une requête lookup de plus */
async function post(path: string, handle: string, beforeLookup: () => Promise<unknown>): Promise<Outcome> {
  const { outcome, body } = await call(path, {
    method: "POST",
    body: new URLSearchParams({ screen_name: handle, skip_status: "1" }),
  });
  if (!routeMaybeGone(body)) return outcome;
  // Un compte qui existe encore prouve que c'est la route qui a disparu : sans
  // cette vérification, un déblocage serait noté fait sans avoir eu lieu.
  await beforeLookup();
  const reply = await lookupBlocking([handle]);
  if ("kind" in reply) return reply.kind === "failed" ? { kind: "broken", ...failureOf(reply) } : reply;
  return reply.found.has(handle) ? { kind: "broken", code: "route_gone" } : outcome;
}

const noCount = async (): Promise<void> => {};

export const blockUser = (handle: string, beforeLookup: () => Promise<unknown> = noCount): Promise<Outcome> =>
  post(BLOCK_PATH, handle, beforeLookup);

/**
 * Débloque un compte. Issue "ok" : le compte est débloqué. Issue "not_found" :
 * compte disparu, rien à débloquer.
 */
export const unblockUser = (handle: string, beforeLookup: () => Promise<unknown> = noCount): Promise<Outcome> =>
  post(UNBLOCK_PATH, handle, beforeLookup);

export type LookupReply = Lookup | Exclude<Outcome, { kind: "ok" }>;

/**
 * Demande à X lesquels de ces comptes (100 au plus) l'utilisateur bloque déjà.
 * Lecture seule : rien n'est modifié côté X.
 */
export async function lookupBlocking(handles: readonly string[]): Promise<LookupReply> {
  const query = new URLSearchParams({ screen_name: handles.join(",") });
  const { outcome, body, quota } = await call(`${LOOKUP_PATH}?${query}`, { method: "GET" });
  const quotaInfo = typeof quota === "number" ? { quotaEnd: quota } : {};
  // Seul ce code prouve qu'aucun compte du paquet n'existe. Un autre (route
  // disparue après un changement de l'API…) marquerait à tort 100 comptes introuvables.
  if (noUserMatch(body)) return { found: new Set(), blocking: new Set(), ...quotaInfo };
  if (outcome.kind === "not_found") return { kind: "failed", ...failureOf(outcome) };
  if (outcome.kind !== "ok") return outcome;
  const lookup = readLookup(body);
  return lookup ? { ...lookup, ...quotaInfo } : { kind: "failed", code: "unreadable_reply" };
}
