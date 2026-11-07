// Surveillance du fil : dès qu'un compte de la liste apparaît (auteur d'un
// tweet, d'un tweet cité, ou suggestion de compte), son contenu est masqué et
// le compte entre dans la file de blocage.
//
// Seul l'auteur compte : un tweet qui mentionne un compte de la liste, ou un
// retweet par un compte hors liste, n'est pas visé par le nom du retweeteur.
//
// La même lecture repère, sans aucune requête à X, les comptes que
// l'utilisateur bloquait déjà : X affiche « Débloquer » à côté d'eux, dans la
// page « Comptes bloqués » comme sur leur profil.
//
// Ce qu'affiche la page vaut pour le compte X connecté à son chargement : si
// la session passe sur un autre compte entre-temps, plus rien n'est signalé.
import { contextAlive } from "../../core/context.ts";
import { accountKey, getState, onStateChange, resultChanges, stringArray, type StateChanges } from "../../core/state.ts";
import { write } from "../../core/write.ts";
import { active, isPending, resultOf, type Results } from "../blocking/queue.ts";
import { handleFromHref, handleFromUserNameText, profileHandleFromPath } from "../x/authors.ts";
import { accountId, pageAccount } from "../x/session.ts";
import { Batch } from "./batch.ts";
import {
  HIDDEN_ATTR,
  PRIMARY_COLUMN_SELECTOR,
  PROFILE_NAME_SELECTOR,
  TWEET_SELECTOR,
  UNBLOCK_BUTTON_SELECTOR,
  USER_CELL_SELECTOR,
  USER_NAME_SELECTOR,
} from "../x/selectors.ts";

let listed = new Set<string>();
let results: Results = Object.create(null);
/** Préfixe des clés de stockage du compte X de la page. */
let prefix = "";

/**
 * La session a changé de compte : ce que la page affiche ne vaut plus pour le
 * compte connecté, rien n'est envoyé. Le rechargement de la page reprendra.
 */
const sameAccount = (): boolean => accountId() === pageAccount();

/** Comptes vus dans le fil, à mettre en file. L'écriture réveille le traitement. */
const seenBatch = new Batch((handles) => write("addSeen", handles, pageAccount()), sameAccount);
/** Comptes de la liste vus comme déjà bloqués sur X. */
const knownBatch = new Batch((handles) => write("markAlreadyBlocked", handles, pageAccount()), sameAccount);

/**
 * Un compte débloqué par Barrage depuis le chargement de la page peut encore y
 * figurer bloqué : X garde en mémoire le profil tel qu'il l'a chargé, avec son
 * bouton « Débloquer ». Ce bouton-là ne prouve rien.
 */
function unblockedSinceLoad(handle: string): boolean {
  const result = resultOf(results, handle);
  return result?.state === "unblocked" && result.at >= performance.timeOrigin;
}

function noteAlreadyBlocked(handle: string): void {
  if (listed.has(handle) && isPending(resultOf(results, handle)) && !unblockedSinceLoad(handle)) knownBatch.add(handle);
}

/** Profil affiché : celui que l'utilisateur est venu voir, lui seul n'est pas masqué. */
let profile: string | null = null;

/** Profil visité d'un compte que l'utilisateur bloque : X y affiche « Débloquer ». */
function scanProfile(): void {
  const handle = profile;
  if (!handle || !listed.has(handle)) return;
  const column = document.querySelector(PRIMARY_COLUMN_SELECTOR);
  // Pendant un changement de page, l'en-tête du profil précédent reste un
  // moment affiché alors que l'adresse a déjà changé : le bouton ne compte que
  // si l'en-tête affiché est bien celui de ce compte.
  const shown = column?.querySelector(PROFILE_NAME_SELECTOR)?.textContent;
  if (!shown || handleFromUserNameText(shown) !== handle) return;
  const button = column?.querySelector(UNBLOCK_BUTTON_SELECTOR);
  // Un bouton dans une suggestion de compte vise ce compte-là, pas le profil.
  if (button && !button.closest(USER_CELL_SELECTOR)) noteAlreadyBlocked(handle);
}

/** Premier lien vers un profil dans `root`. */
function firstProfileHandle(root: Element): string | null {
  for (const a of root.querySelectorAll("a[href]")) {
    const handle = handleFromHref(a.getAttribute("href"));
    if (handle) return handle;
  }
  return null;
}

function tweetAuthors(article: Element): string[] {
  const authors: string[] = [];
  for (const block of article.querySelectorAll(USER_NAME_SELECTOR)) {
    // L'auteur principal a un lien vers son profil, l'auteur cité seulement du texte.
    const handle = firstProfileHandle(block) ?? handleFromUserNameText(block.textContent ?? "");
    if (handle) authors.push(handle);
  }
  return authors;
}

function cellAuthor(cell: Element): string[] {
  // Premier lien de profil : l'avatar. Les liens de la bio, plus loin, sont des mentions.
  const handle = firstProfileHandle(cell);
  return handle ? [handle] : [];
}

/**
 * Idempotent : X recycle parfois un nœud pour un autre tweet, l'attribut est
 * donc recalculé à chaque passage plutôt que posé une fois pour toutes.
 */
function apply(element: Element, authors: string[]): void {
  const matches = authors.filter((h) => listed.has(h));
  // Écrire seulement si l'état change : une écriture d'attribut réveille les observateurs de X.
  const hide = matches.some((h) => h !== profile);
  if (hide !== element.hasAttribute(HIDDEN_ATTR)) element.toggleAttribute(HIDDEN_ATTR, hide);

  for (const handle of matches) if (isPending(resultOf(results, handle))) seenBatch.add(handle);
}

function scanCell(cell: Element): void {
  const authors = cellAuthor(cell);
  if (cell.querySelector(UNBLOCK_BUTTON_SELECTOR)) {
    // Compte déjà bloqué (page « Comptes bloqués ») : rien à masquer ni à bloquer.
    for (const handle of authors) noteAlreadyBlocked(handle);
    if (cell.hasAttribute(HIDDEN_ATTR)) cell.removeAttribute(HIDDEN_ATTR);
  } else apply(cell, authors);
}

/**
 * Tweets et suggestions qui contiennent `root`, et ceux qu'il contient si
 * `deep`. Le nœud parent d'un ajout n'est relu que vers le haut : c'est
 * souvent tout le fil, dont le reste n'a pas changé.
 */
function scanWithin(root: ParentNode & Node, deep: boolean, done: Set<Element>): void {
  for (const [selector, handle] of [
    [TWEET_SELECTOR, (el: Element) => apply(el, tweetAuthors(el))],
    [USER_CELL_SELECTOR, scanCell],
  ] as const) {
    const around = root instanceof Element ? root.closest(selector) : null;
    const inside = deep ? [...root.querySelectorAll(selector)] : [];
    for (const el of [...(around ? [around] : []), ...inside]) {
      if (done.has(el)) continue;
      done.add(el);
      handle(el);
    }
  }
}

/**
 * Zones du DOM modifiées depuis le dernier passage, ou null pour tout relire :
 * nœud ajouté (relu en entier) ou parent d'un changement (relu vers le haut).
 */
let dirtyRoots: Map<Node, boolean> | null = null;
let lastPath = "";

/**
 * Au-delà, tout sera relu. Dans un onglet caché, les passages sont suspendus
 * alors que les mutations continuent : la Map retiendrait des nœuds détachés.
 */
const MAX_DIRTY_ROOTS = 2000;

function markDirty(node: Node, deep: boolean): void {
  if (!dirtyRoots || dirtyRoots.get(node)) return;
  dirtyRoots.set(node, deep);
  if (dirtyRoots.size > MAX_DIRTY_ROOTS) dirtyRoots = null;
}

function scan(): void {
  // X change de page sans recharger : le profil affiché est relu à chaque
  // passage, et un changement de page, qui change le profil exempté, fait tout relire.
  profile = profileHandleFromPath(location.pathname);
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    dirtyRoots = null;
  }
  const roots = dirtyRoots;
  dirtyRoots = new Map();
  if (!listed.size) return;
  const done = new Set<Element>();
  if (roots === null) scanWithin(document, true, done);
  else for (const [root, deep] of roots) if (root.isConnected) scanWithin(root as ParentNode & Node, deep, done);
  scanProfile();
  knownBatch.flush();
  seenBatch.flush();
}

let scheduled = false;
function scheduleScan(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    scan();
  });
}

/** Liste suivie changée : tout est relu. */
async function loadList(): Promise<void> {
  const state = await getState(pageAccount());
  // Un compte désactivé n'est plus masqué.
  listed = new Set(active(state));
  results = state.results;
  prefix = state.prefix;
  // Plus aucun compte suivi : ce qui avait été masqué réapparaît.
  if (!listed.size) for (const el of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) el.removeAttribute(HIDDEN_ATTR);
  dirtyRoots = null;
  scheduleScan();
}

/**
 * Résultats ou file changés : rien à masquer de plus ni de moins, seuls les
 * comptes à signaler changent. Ni lecture du stockage, ni relecture de la page.
 */
function onQueueChange(changes: StateChanges): void {
  const { before, after } = resultChanges(changes, prefix);
  for (const handle of Object.keys(before)) if (!(handle in after)) delete results[handle];
  Object.assign(results, after);
  // Un compte sorti de la file (traité, désactivé, écriture perdue) pourra être
  // signalé de nouveau s'il réapparaît en attente dans le fil.
  const seenChange = changes[accountKey(prefix, "seen")];
  if (seenChange) seenBatch.keepOnly(new Set(stringArray(seenChange.newValue)));
}

export function watchTimeline(): void {
  void loadList();
  // Premier compte X vu : ses clés de stockage peuvent changer de préfixe.
  onStateChange(() => void loadList(), ["lists", "remote", "disabled", "account"]);
  onStateChange(onQueueChange, ["results", "seen"]);
  // Le fil est virtualisé : les tweets entrent et sortent du DOM au défilement.
  const observer = new MutationObserver((records) => {
    // Extension rechargée ou désinstallée : ce script orphelin s'arrête au lieu
    // d'échouer à chaque mutation. Rien ne le remplace avant le rechargement de
    // l'onglet : sans permission scripting, un onglet ouvert n'est pas réinjecté.
    if (!contextAlive()) return observer.disconnect();
    // Sans liste, rien à relire : le retour d'une liste fait tout relire, voir loadList.
    if (!listed.size) return;
    // Seules les zones modifiées sont relues, pas toute la page.
    for (const record of records) {
      markDirty(record.target, false);
      for (const node of record.addedNodes) if (node instanceof Element) markDirty(node, true);
    }
    scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
