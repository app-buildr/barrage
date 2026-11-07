// Traduction de la réponse de X en décision pour la file. Fonction pure,
// isolée pour être testable.
import { RATE_LIMIT_FALLBACK_MS } from "../../core/config.ts";

/**
 * Échec tel qu'il est stocké : un code, jamais une phrase. Le texte n'est résolu
 * qu'à l'affichage, voir error-text.ts, pour qu'une reformulation atteigne aussi
 * les résultats déjà enregistrés.
 */
export type FailureCode =
  | "account_missing"
  | "account_suspended"
  | "lookup_missing"
  | "session_expired"
  | "session_missing"
  | "token_invalid"
  | "token_expired"
  | "x_account_locked"
  | "x_account_suspended"
  | "x_account_restricted"
  | "automation"
  | "unreadable_reply"
  | "x_unavailable"
  | "refused_silently"
  | "refused"
  | "route_gone"
  | "network_down"
  | "unreadable_error";

/** `param` : numéro cité par le texte, statut HTTP ou code d'erreur de X. */
export type Failure = { code: FailureCode; param?: number };

export type Outcome =
  /** Réponse 2xx sans erreur : la demande a abouti. */
  | { kind: "ok" }
  /** Compte inexistant ou suspendu : rien à bloquer, inutile de retenter. */
  | ({ kind: "not_found" } & Failure)
  /** Limite atteinte : tout le traitement attend jusqu'à `until`. */
  | { kind: "rate_limited"; until: number }
  /** X soupçonne une automatisation : tout s'arrête, voir recordAutomation. */
  | ({ kind: "automation" } & Failure)
  /** Réponse sans code d'erreur connu : X a changé, ce compte n'y est pour rien. Tout s'arrête. */
  | ({ kind: "broken" } & Failure)
  /** Session absente, expirée ou compte verrouillé : tout le traitement attend. */
  | ({ kind: "auth" } & Failure)
  /** Panne passagère sans réponse de X : retenter sans compter d'échec. */
  | ({ kind: "network" } & Failure)
  /**
   * Refus de X avec un code d'erreur, propre à ce compte : compté comme une
   * tentative échouée. `detail` : message brut de X, journalisé mais jamais
   * affiché ni stocké, sa langue n'étant pas celle de l'extension.
   */
  | ({ kind: "failed"; detail?: string } & Failure);

/** Ce qui se stocke d'une issue en échec. */
export const failureOf = ({ code, param }: Failure): Failure => (param === undefined ? { code } : { code, param });

// Codes d'erreur de l'API v1.1 de X.
const NOT_FOUND_CODES: Record<number, FailureCode> = {
  34: "account_missing",
  50: "account_missing",
  63: "account_suspended",
};
const RATE_LIMIT_CODE = 88;
const AUTH_CODES: Record<number, FailureCode> = {
  32: "session_expired",
  215: "session_expired",
  326: "x_account_locked",
  353: "token_invalid",
  // Refus qui visent tout le compte de l'utilisateur, pas le compte à bloquer.
  64: "x_account_suspended",
  89: "token_expired",
  261: "x_account_restricted",
};
/** Réponse de `friendships/lookup` quand aucun compte du paquet n'existe, voir noUserMatch. */
const NO_USER_MATCH_CODE = 17;
/** X soupçonne une automatisation. */
const AUTOMATION_CODE = 226;
/** « Compte introuvable », mais aussi ce que répond une route disparue, voir routeMaybeGone. */
const PAGE_NOT_FOUND_CODE = 34;

type ApiError = { code?: unknown; message?: unknown };

function firstError(body: unknown): { code: number | null; message: string | null } {
  const errors = (body as { errors?: unknown } | null)?.errors;
  const first = (Array.isArray(errors) ? errors[0] : undefined) as ApiError | undefined;
  return {
    code: typeof first?.code === "number" ? first.code : null,
    message: typeof first?.message === "string" ? first.message : null,
  };
}

/** La réponse dit qu'aucun des comptes demandés n'existe, et rien d'autre. */
export function noUserMatch(body: unknown): boolean {
  return firstError(body).code === NO_USER_MATCH_CODE;
}

/** La réponse vaut « introuvable », sans prouver que c'est le compte qui manque et pas la route. */
export function routeMaybeGone(body: unknown): boolean {
  return firstError(body).code === PAGE_NOT_FOUND_CODE;
}

/**
 * @param resetHeader valeur de `x-rate-limit-reset`, en secondes epoch
 * @param now horodatage courant, en millisecondes
 */
export function classify(status: number, body: unknown, resetHeader: string | null, now: number): Outcome {
  const { code, message } = firstError(body);

  if (code === AUTOMATION_CODE) return { kind: "automation", code: "automation" };
  if (status === 429 || code === RATE_LIMIT_CODE) {
    const reset = Number(resetHeader) * 1000;
    // Un en-tête absent, illisible ou déjà passé ne doit pas relancer aussitôt.
    return { kind: "rate_limited", until: reset > now ? reset : now + RATE_LIMIT_FALLBACK_MS };
  }
  const notFound = code === null ? undefined : NOT_FOUND_CODES[code];
  if (notFound) return { kind: "not_found", code: notFound };
  const auth = code === null ? undefined : AUTH_CODES[code];
  if (auth) return { kind: "auth", code: auth };
  if (status === 401) return { kind: "auth", code: "session_expired" };
  if (status >= 200 && status < 300 && code === null) {
    // Sans corps JSON (page HTML, réponse vide), rien ne prouve que X a traité la demande.
    return body === null ? { kind: "broken", code: "unreadable_reply" } : { kind: "ok" };
  }
  if (status >= 500) return { kind: "network", code: "x_unavailable", param: status };
  if (code === null) return { kind: "broken", code: "refused_silently", param: status };
  return { kind: "failed", code: "refused", param: code, ...(message ? { detail: message } : {}) };
}

export type Lookup = {
  /** Comptes que X connaît, identifiants minuscules. */
  found: Set<string>;
  /** Parmi eux, ceux que l'utilisateur bloque déjà. */
  blocking: Set<string>;
};

/**
 * Lit la réponse de `friendships/lookup` : un objet par compte existant, avec
 * la liste de ses relations à l'utilisateur ("following", "blocking"…). Les
 * comptes inexistants ou suspendus sont absents de la réponse.
 */
export function readLookup(body: unknown): Lookup | null {
  if (!Array.isArray(body)) return null;
  const found = new Set<string>();
  const blocking = new Set<string>();
  for (const entry of body as Array<{ screen_name?: unknown; connections?: unknown }>) {
    if (typeof entry?.screen_name !== "string") continue;
    const handle = entry.screen_name.toLowerCase();
    found.add(handle);
    if (Array.isArray(entry.connections) && entry.connections.includes("blocking")) blocking.add(handle);
  }
  return { found, blocking };
}
