// Session X de l'onglet : qui est connecté, lu dans les cookies et la barre
// latérale. Content script seulement. Ne fait aucune requête : les appels à
// l'API vivent dans features/blocking/api.ts.
import { isPingRequest, type PingReply } from "../../core/messages.ts";
import { handleFromUserNameText } from "./authors.ts";
import { ACCOUNT_BUTTON_SELECTOR } from "./selectors.ts";

function cookie(name: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(document.cookie);
  return match?.[1] ?? null;
}

/** Le cookie ct0 sert de jeton anti-CSRF, X exige de le recopier en en-tête. */
export const readCsrfToken = (): string | null => cookie("ct0");

/**
 * Un compte X est connecté dans cet onglet. Le cookie twid porte son
 * identifiant ; à défaut, le bouton de compte de la barre latérale n'existe
 * que pour un compte connecté.
 */
export function signedIn(): boolean {
  return cookie("twid") !== null || document.querySelector(ACCOUNT_BUTTON_SELECTOR) !== null;
}

/** Identifiant @ du compte connecté, affiché dans les options, ou null tant que la barre latérale n'est pas là. */
export function accountHandle(): string | null {
  return handleFromUserNameText(document.querySelector(ACCOUNT_BUTTON_SELECTOR)?.textContent ?? "");
}

/**
 * Identifiant numérique du compte X connecté, lu à chaque appel : changer de
 * compte sur x.com change le cookie twid (« u=123… ») de tous les onglets.
 */
export function accountId(): string | null {
  // Valeur encodée ou non, entre guillemets ou non : « u%3D123 », « "u=123" ».
  return /^"?u(?:=|%3D)(\d+)"?$/i.exec(cookie("twid") ?? "")?.[1] ?? null;
}

let loadedAccount: string | null | undefined;

/**
 * Compte X connecté au chargement de la page, lu au premier appel : le
 * traitement et le fil le demandent dès leur démarrage. Ce que la page affiche
 * (fil, barre latérale) vaut pour lui, même si la session passe ensuite sur
 * un autre compte.
 */
export function pageAccount(): string | null {
  if (loadedAccount === undefined) loadedAccount = accountId();
  return loadedAccount;
}

/**
 * Empreinte de la session X, ou null sans session. Le jeton lui-même n'est
 * jamais stocké : seule une empreinte courte permet de voir qu'il a changé
 * (reconnexion).
 */
export async function sessionId(): Promise<string | null> {
  const csrf = readCsrfToken();
  if (!csrf) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csrf));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Se déclarer vivant auprès des options, avec l'état de la session, voir xTabStatus. */
export function answerPings(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (reply: PingReply) => void) => {
    if (!isPingRequest(message)) return false;
    sendResponse({ session: signedIn() });
    return false;
  });
}
