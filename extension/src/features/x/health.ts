// Sondes de santé du content script : X peut changer son cookie de session ou
// le DOM de son fil sans que rien n'échoue. La panne reste du bon côté, rien ne
// part vers X, mais l'utilisateur se croirait protégé : les options l'alertent.
// Ces sondes lisent la page et n'envoient rien à X.
import { HEALTH_PROBE_MS } from "../../core/config.ts";
import { contextAlive } from "../../core/context.ts";
import type { HealthIssue } from "../../core/state.ts";
import { write } from "../../core/write.ts";
import { accountId, signedIn } from "./session.ts";
import { FEED_CELL_SELECTOR, TWEET_SELECTOR, USER_CELL_SELECTOR, USER_NAME_SELECTOR } from "./selectors.ts";

/** En dessous, le fil n'a peut-être pas fini de se dessiner. */
const MIN_FEED_CELLS = 3;

export type PageView = {
  signedIn: boolean;
  accountReadable: boolean;
  /** L'onglet est visible, sur le fil d'accueil : X n'y dessine rien en arrière-plan. */
  onFeed: boolean;
  cells: number;
  tweets: number;
  userCells: number;
  authors: number;
};

/**
 * Verdict sur la page : null si tout va bien, undefined si elle ne permet pas de
 * juger. Un fil sans tweet n'alerte qu'à partir de MIN_FEED_CELLS cellules :
 * un compte neuf peut n'y voir que des suggestions.
 */
export function healthVerdict(page: PageView): HealthIssue | null | undefined {
  if (!page.signedIn) return undefined;
  if (!page.accountReadable) return "session";
  if (!page.onFeed || page.cells < MIN_FEED_CELLS) return undefined;
  if (!page.tweets && !page.userCells) return "timeline";
  return page.tweets && !page.authors ? "timeline" : null;
}

function readPage(): PageView {
  const count = (selector: string) => document.querySelectorAll(selector).length;
  return {
    signedIn: signedIn(),
    accountReadable: accountId() !== null,
    onFeed: location.pathname === "/home" && document.visibilityState === "visible",
    cells: count(FEED_CELL_SELECTOR),
    tweets: count(TWEET_SELECTOR),
    userCells: count(USER_CELL_SELECTOR),
    authors: count(USER_NAME_SELECTOR),
  };
}

async function probe(): Promise<void> {
  if (!contextAlive()) return;
  const verdict = healthVerdict(readPage());
  if (verdict === undefined) return watchHealth();
  const { health } = await chrome.storage.local.get({ health: null });
  if (health !== verdict) await write("setHealth", verdict);
}

/** Une sonde par délai jusqu'à un verdict, soit une écriture au plus par chargement de x.com. */
export function watchHealth(): void {
  setTimeout(() => void probe().catch((err: unknown) => console.warn("[Barrage]", err)), HEALTH_PROBE_MS);
}
