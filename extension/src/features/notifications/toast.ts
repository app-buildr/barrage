// Notifications « @user vient d'être bloqué » et « @user a été débloqué » sur x.com. Chaque onglet X
// surveille les résultats : le blocage a pu être fait par un autre onglet, et
// c'est dans celui que l'utilisateur regarde que la notification doit paraître.
import { onStateChange, prefixFor, resultChanges, type StateChanges } from "../../core/state.ts";
import { element } from "../../ui/dom.ts";
import { write } from "../../core/write.ts";
import { accountId } from "../blocking/api.ts";
import { newlyBlocked, newlyUnblocked } from "../blocking/queue.ts";
import "./toast.css";

// Noms repris par toast.css.
const TOAST_STACK_ID = "barrage-toasts";
const TOAST_CLASS = "barrage-toast";

/** Le temps de lire et, au besoin, de cliquer « Annuler ». */
const TOAST_MS = 5000;
/** Confirmation de « Annuler » : rien à faire, juste à lire. */
const CONFIRM_MS = 3000;
/** Au-delà, les plus anciennes notifications cèdent la place. */
const MAX_TOASTS = 3;

function stack(): HTMLElement {
  let el = document.getElementById(TOAST_STACK_ID);
  if (!el) {
    el = element("div");
    el.id = TOAST_STACK_ID;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.append(el);
  }
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Élément SVG construit sans innerHTML. */
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
  ...children: SVGElement[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.append(...children);
  return el;
}

/** Logo Barrage : disque corail barré de blanc. */
const blockIcon = () =>
  svg(
    "svg",
    { viewBox: "0 0 40 40", "aria-hidden": "true" },
    svg("circle", { cx: "20", cy: "20", r: "20", fill: "#F0643C" }),
    svg("rect", { x: "10", y: "16.75", width: "20", height: "6.5", rx: "1.5", fill: "#fff" }),
  );

/** Flèche de retour sur disque corail pâle. */
const undoIcon = () =>
  svg(
    "svg",
    { viewBox: "0 0 40 40", "aria-hidden": "true" },
    svg("circle", { cx: "20", cy: "20", r: "19.5", fill: "#FFF6EE", stroke: "#FDE3D8" }),
    svg("path", {
      d: "M17 13l-4.5 4.5L17 22M12.5 17.5h9a5.5 5.5 0 0 1 0 11H19",
      fill: "none",
      stroke: "#B83A14",
      "stroke-width": "2.2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );

const closeIcon = () =>
  svg(
    "svg",
    { viewBox: "0 0 24 24", "aria-hidden": "true" },
    svg("path", {
      d: "M7 7l10 10M17 7 7 17",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
    }),
  );

/**
 * Contenu d'une notification, remplaçable sur place. Espaces insécables
 * (\u00a0) avant la ponctuation : elle ne passe jamais seule à la ligne.
 */
type Content = {
  kind: "blocked" | "unblocked";
  /** Suite du titre, après le nom. */
  title: string;
  /** Ligne secondaire : texte, puis bouton « Annuler » si `undo` est fourni. */
  detail: string;
  undo?: () => void;
  /** Durée d'affichage, TOAST_MS par défaut. */
  duration?: number;
  /** Faux : le décompte continue sous la souris, rien à cliquer. Vrai par défaut. */
  pausable?: boolean;
};

/** Notification affichée, par compte : un déblocage la met à jour au lieu d'en ajouter une. */
type Toast = { update(content: Content): void; readonly alive: boolean };
const shown = new Map<string, Toast>();
/**
 * Comptes dont le blocage vient d'être annulé dans cet onglet : la
 * notification a déjà confirmé l'annulation, le déblocage effectif (quelques
 * secondes plus tard, au tour suivant de la file) n'en affiche pas d'autre.
 */
const cancelled = new Set<string>();

const BLOCKED: Omit<Content, "undo"> = { kind: "blocked", title: " vient d'être bloqué\u00a0!\u00a0✊", detail: "par Barrage" };
const UNBLOCKED: Content = {
  kind: "unblocked",
  title: " a été débloqué.",
  detail: "Barrage ne le bloquera plus automatiquement.",
};
/** Après « Annuler » : état final tout de suite, le déblocage suit dans la file. */
const CANCELLED: Content = {
  kind: "unblocked",
  title: "\u00a0: blocage annulé.",
  detail: UNBLOCKED.detail,
  duration: CONFIRM_MS,
  pausable: false,
};

function showToast(handle: string, content: Content): Toast {
  const existing = shown.get(handle);
  // Une notification évincée de la pile n'est plus dans la page : on en crée une.
  if (existing?.alive) {
    existing.update(content);
    return existing;
  }
  const container = stack();

  // Le nom ouvre le profil dans un nouvel onglet.
  const link = element("a", { className: "barrage-toast-handle", textContent: `@${handle}` });
  link.href = `https://x.com/${encodeURIComponent(handle)}`;
  link.target = "_blank";
  link.rel = "noopener";

  const title = element("span", { className: "barrage-toast-title" });
  const sub = element("span", { className: "barrage-toast-detail" });
  const icon = element("span", { className: "barrage-toast-icon" });
  const close = element("button", { className: "barrage-toast-close" }, closeIcon());
  close.type = "button";
  close.setAttribute("aria-label", "Fermer");
  // Temps d'affichage restant, en barre qui se vide.
  const timer = element("span", { className: "barrage-toast-timer" });

  const toast = element(
    "div",
    { className: TOAST_CLASS },
    icon,
    element("span", { className: "barrage-toast-body" }, title, sub),
    close,
    timer,
  );

  const remove = () => {
    toast.remove();
    if (shown.get(handle) === controller) shown.delete(handle);
  };
  const leave = () => {
    toast.classList.add("leaving");
    // Retrait après l'animation de sortie, ou tout de suite si elle n'a pas lieu.
    toast.addEventListener("transitionend", remove, { once: true });
    setTimeout(remove, 400);
  };
  close.addEventListener("click", leave);

  // La barre donne le rythme : la notification part quand elle est vide. Elle
  // s'arrête tant que la souris ou le focus clavier sont dessus, pas de
  // notification qui disparaît au moment de cliquer « Annuler ». Le focus
  // laissé par un clic de souris ne compte pas, sinon le décompte resterait figé.
  const countdown = timer.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
    duration: TOAST_MS,
    easing: "linear",
    fill: "forwards",
  });
  countdown.onfinish = leave;
  /** Décompte suspendu au survol, selon l'état affiché. */
  let pausable = true;
  const hovered = () =>
    pausable && (toast.matches(":hover") || toast.querySelector(":focus-visible") !== null);
  const resume = () => {
    if (!hovered()) countdown.play();
  };
  toast.addEventListener("mouseenter", () => {
    if (pausable) countdown.pause();
  });
  toast.addEventListener("focusin", () => {
    if (hovered()) countdown.pause();
  });
  toast.addEventListener("mouseleave", resume);
  toast.addEventListener("focusout", () => setTimeout(resume));

  const controller: Toast = {
    get alive() {
      // Une notification en train de partir n'est plus réutilisée.
      return toast.isConnected && !toast.classList.contains("leaving");
    },
    update({ kind, title: rest, detail, undo, duration = TOAST_MS, pausable: canPause = true }) {
      pausable = canPause;
      toast.className = `${TOAST_CLASS} ${kind}`;
      icon.replaceChildren(kind === "blocked" ? blockIcon() : undoIcon());
      title.replaceChildren(link, rest);
      sub.replaceChildren(detail);
      if (undo) {
        const button = element("button", { className: "barrage-toast-undo", textContent: "Annuler" });
        button.type = "button";
        button.addEventListener("click", () => {
          const keyboard = button.matches(":focus-visible");
          cancelled.add(handle);
          undo();
          // La même notification confirme l'annulation. Au clavier, le focus
          // perdu avec le bouton retiré passe sur « Fermer ».
          controller.update(CANCELLED);
          if (keyboard) close.focus();
        });
        sub.append(" · ", button);
      }
      // Nouvel état : le décompte repart de zéro, à sa durée.
      countdown.effect?.updateTiming({ duration });
      countdown.currentTime = 0;
      if (hovered()) countdown.pause();
      else countdown.play();
    },
  };
  controller.update(content);
  shown.set(handle, controller);

  container.append(toast);
  while (container.childElementCount > MAX_TOASTS) container.firstElementChild?.remove();
  return controller;
}

/** Seuls les blocages du compte X connecté sont annoncés. */
async function announce(changes: StateChanges): Promise<void> {
  const { before, after } = resultChanges(changes, await prefixFor(accountId()));
  const blocked = newlyBlocked(before, after);
  const unblocked = newlyUnblocked(before, after);
  if (!blocked.length && !unblocked.length) return;
  const { notify } = await chrome.storage.local.get({ notify: true });
  if (notify === false) return;
  // « Annuler » coupe le blocage automatique du compte, ce qui le débloque.
  for (const handle of blocked) {
    showToast(handle, { ...BLOCKED, undo: () => void write("setEnabled", handle, false) });
  }
  // Tout déblocage coupe le blocage automatique du compte. Après « Annuler »,
  // la notification l'a déjà confirmé : pas de seconde notification.
  for (const handle of unblocked) {
    if (!cancelled.delete(handle)) showToast(handle, UNBLOCKED);
  }
}

export function watchBlocks(): void {
  // Onglet caché : ses animations s'arrêtent, le décompte aussi. Une
  // notification laissée là réapparaîtrait au retour, périmée : on les retire.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    document.getElementById(TOAST_STACK_ID)?.replaceChildren();
    shown.clear();
  });
  onStateChange((changes) => {
    // Inutile de dessiner dans un onglet que personne ne regarde.
    if (document.visibilityState !== "visible") return;
    void announce(changes);
  }, ["results"]);
}
