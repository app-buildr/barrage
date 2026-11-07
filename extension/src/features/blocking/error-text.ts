// Textes des échecs, résolus à l'affichage depuis les codes stockés. Lu par les
// options seulement : le content script et le service worker n'écrivent que des
// codes. Fonctions pures, testées dans tests/error-text.test.ts.
import { CHECK_RETRY_MS, NETWORK_RETRY_MS } from "../../core/config.ts";
import { plural } from "../../core/format.ts";
import type { BlockingError, ErrorContext, ErrorReason, HealthIssue } from "../../core/state.ts";
import type { Failure, FailureCode } from "./outcome.ts";
import type { FailedResult } from "./queue.ts";

const SESSION_EXPIRED = "Session X absente ou expirée : reconnectez-vous à x.com.";

const TEXTS: Record<FailureCode, (param: number | undefined) => string> = {
  account_missing: () => "Compte introuvable.",
  account_suspended: () => "Compte suspendu.",
  lookup_missing: () => "Compte introuvable ou suspendu.",
  session_expired: () => SESSION_EXPIRED,
  session_missing: () => "Aucune session X : connectez-vous à x.com.",
  token_invalid: () => "Jeton de session X invalide : rechargez l'onglet x.com.",
  token_expired: () => "Jeton de session X expiré : rechargez l'onglet x.com.",
  x_account_locked: () => "Votre compte X est verrouillé : déverrouillez-le sur x.com.",
  x_account_suspended: () => "Votre compte X est suspendu : Barrage ne peut rien bloquer.",
  x_account_restricted: () => "X n'autorise plus d'actions depuis votre compte pour l'instant.",
  automation: () => "X soupçonne une activité automatisée : Barrage s'est arrêté pour protéger votre compte.",
  unreadable_reply: () => "Réponse de X illisible.",
  x_unavailable: (status) => `X indisponible (HTTP ${status}).`,
  refused_silently: (status) => `Refus de X sans explication (HTTP ${status}).`,
  refused: (code) => `Refus de X (code ${code}).`,
  route_gone: () => "Action refusée par X : route introuvable.",
  network_down: () => "Réseau indisponible.",
  unreadable_error: () => "Erreur illisible : Barrage s'est arrêté.",
};

/** Texte d'un échec stocké. Un code venu d'une autre version et inconnu ici ne donne rien. */
function failureText({ code, param }: Partial<Failure>): string | undefined {
  return code !== undefined && Object.hasOwn(TEXTS, code) ? TEXTS[code](param) : undefined;
}

/** Cause d'un résultat : son code, ou le texte qu'une version antérieure a stocké. */
export const resultText = (result: FailedResult): string | undefined => failureText(result) ?? result.message;

const STOPPED = "Barrage s'est arrêté : X a peut-être changé.";

function inContext(cause: string, context: ErrorContext | undefined): string {
  if (context === undefined) return cause;
  if (context === "stopped") return `${cause} ${STOPPED}`;
  if (context === "reconnected") {
    return "X refuse encore les requêtes après votre reconnexion : son jeton web a sans doute changé, une mise à jour de Barrage sera nécessaire.";
  }
  if (context === "retry") return `${cause} Nouvel essai dans ${plural(NETWORK_RETRY_MS / 60_000, "minute")}.`;
  if (context === "check") {
    const delay = plural(CHECK_RETRY_MS / 60_000, "minute");
    return `Vérification impossible : ${cause} Nouvel essai au prochain compte vu, dans ${delay} au plus tôt.`;
  }
  if ("refusals" in context) return `${context.refusals} comptes refusés de suite (${cause.replace(/\.$/, "")}). ${STOPPED}`;
  return `Déblocage de @${context.unblock} impossible : ${cause}`;
}

/** Texte d'une erreur bloquante : son code, ou le texte qu'une version antérieure a stocké. */
export function errorText(error: BlockingError): string {
  const cause = failureText(error);
  return cause ? inContext(cause, error.context) : (error.message ?? TEXTS.unreadable_error(undefined));
}

const TITLES: Record<ErrorReason, string> = {
  auth: "Connexion à X impossible",
  network: "Réseau indisponible",
  automation: "Blocage arrêté par prudence",
  api: "Blocage arrêté",
  other: "Blocage interrompu",
};

const SESSION_CODES: ReadonlySet<FailureCode | undefined> = new Set<FailureCode>([
  "session_expired",
  "session_missing",
  "token_invalid",
  "token_expired",
]);

/** Le titre ne parle de session que si c'est elle qui est en cause, pas pour un compte verrouillé. */
export function errorTitle({ reason, code, context }: BlockingError): string {
  return reason === "auth" && SESSION_CODES.has(code) && context !== "reconnected" ? "Session X expirée" : TITLES[reason];
}

export const HEALTH_TITLE = "Barrage ne reconnaît plus x.com";

const HEALTH_TEXTS: Record<HealthIssue, string> = {
  session: "X a changé sa session : Barrage ne sait plus quel compte est connecté et ne bloque plus rien.",
  timeline: "X a changé sa page : Barrage ne repère plus les tweets du fil, plus rien n'est masqué ni mis en file.",
};

/** Texte d'un signe que X a changé. */
export const healthText = (issue: HealthIssue): string =>
  `${HEALTH_TEXTS[issue]} Une mise à jour de Barrage sera sans doute nécessaire.`;
