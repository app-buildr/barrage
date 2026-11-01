// Carte de progression : comptes bloqués sur le total, barre de remplissage.
import { part } from "../../ui/dom.ts";
import { totalCount, type Counts } from "./status.ts";

export function renderProgress(root: HTMLElement, counts: Counts): void {
  const total = totalCount(counts);
  part(root, "blocked").textContent = String(counts.blocked);
  part(root, "total").textContent = `bloqués sur ${total} compte${total > 1 ? "s" : ""}`;

  const bar = part(root, "bar");
  bar.setAttribute(
    "aria-label",
    `${counts.blocked} bloqués, ${counts.visible} visibles, ${counts.problem} problèmes, ${counts.disabled} désactivés`,
  );
  part(root, "fill").style.width = `${total ? (counts.blocked / total) * 100 : 0}%`;
}
