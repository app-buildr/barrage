// État affiché d'un compte dans la liste : libellé, pastille, bouton possible,
// et catégorie pour la progression et les filtres. Fonctions pures, testées
// dans tests/status.test.ts.
import { resultText } from "../blocking/error-text.ts";
import { isPending, type Result } from "../blocking/queue.ts";
import type { Tone } from "../../ui/layout/Section.tsx";

/** Catégories exclusives : leur somme est le nombre de comptes de la liste. */
export const CATEGORIES = ["blocked", "visible", "problem", "disabled"] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * `tag` : l'état s'affiche en pastille ; `note` le précise à côté.
 * `tone` colore un état affiché en texte. `busy` : une demande est dans la file.
 */
export type Status = {
  label: string;
  tone?: Tone;
  action: "block" | "unblock" | null;
  category: Category;
  busy?: boolean;
  tag?: "blocked" | "visible";
  note?: string;
};

const text = (
  label: string,
  category: Category,
  tone: Tone,
  action: Status["action"] = null,
): Status => ({ label, tone, action, category });

const BLOCKED: Status = { label: "Bloqué", action: "unblock", category: "blocked", tag: "blocked" };
const UNBLOCKING: Status = { ...text("Déblocage en cours…", "disabled", "muted"), busy: true };
const WAITING: Status = { ...text("En attente", "visible", "muted"), busy: true };
const BLOCKING: Status = { ...text("Blocage en cours…", "visible", "muted"), busy: true };
const VISIBLE: Status = { label: "Visible", action: "block", category: "visible", tag: "visible" };

/**
 * Compte dont le blocage automatique est sur On. « Bloqué », qu'il l'ait été
 * par l'extension ou déjà par l'utilisateur : la distinction, qui décide d'un
 * déblocage au passage sur Off, n'est pas affichée. `paused` : rien ne part
 * vers X pour l'instant : limite de X, traitement arrêté ou aucun onglet x.com
 * connecté pour le faire.
 */
export function describe(result: Result | undefined, queued: boolean, paused = false): Status {
  if (queued && isPending(result)) return paused ? WAITING : BLOCKING;
  switch (result?.state) {
    case "blocked":
    case "already_blocked":
      return BLOCKED;
    case "not_found":
      return text(resultText(result) ?? "Introuvable", "problem", "warn", "block");
    case "failed":
      return text(`Échec : ${resultText(result) ?? "refus de X"}`, "problem", "error", "block");
    default:
      return VISIBLE;
  }
}

/**
 * Compte dont le blocage automatique est sur Off : Barrage ne le bloque plus.
 * S'il l'avait bloqué, le déblocage est en cours ou fait ; un compte que
 * l'utilisateur bloquait déjà avant Barrage reste bloqué, sauf demande expresse.
 */
export function describeDisabled(result: Result | undefined, unblocking: boolean): Status {
  if (unblocking) return UNBLOCKING;
  switch (result?.state) {
    case "blocked":
      // Hors file de déblocage : X a refusé, « Débloquer » permet de réessayer.
      return { ...BLOCKED, note: "déblocage refusé" };
    case "already_blocked":
      return BLOCKED;
    default:
      return text("Désactivé", "disabled", "muted");
  }
}

export type Counts = Record<Category, number>;

export function countCategories(statuses: readonly Status[]): Counts {
  const counts: Counts = { blocked: 0, visible: 0, problem: 0, disabled: 0 };
  for (const status of statuses) counts[status.category]++;
  return counts;
}

export function totalCount(counts: Counts): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c], 0);
}
