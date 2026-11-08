// Dessin des badges, en données : rendu en React par BadgeDisc, et en HTML
// statique par sharePages.ts pour les pages et images de partage. Tracés sur
// 24×24, au trait (stroke="currentColor", sans remplissage).
import { createElement, type ReactElement, type SVGProps } from "react";
import type { Palier } from "./badges.ts";

type Tag = "path" | "rect" | "line" | "circle" | "polygon";

/** Un élément SVG : balise et attributs, aux noms de React (strokeWidth…), vérifiés par TypeScript. */
export type Shape = readonly [tag: Tag, attrs: Readonly<SVGProps<SVGElement>>];

export const BADGE_ICONS: Readonly<Record<Palier, readonly Shape[]>> = {
  1: [
    ["path", { d: "M4.5 17.5l1.8-6.2 4.7-3.8 5.6 1.4 3 5.4-2.3 4.2H7.2z" }],
    ["path", { d: "M11 7.5l1.6 4.5 4.6-1.6" }],
    ["path", { d: "M12.6 12l-2.6 6.5" }],
  ],
  10: [["path", { d: "M12 3l7 3v5.5c0 4.6-3 7.8-7 9.5-4-1.7-7-4.9-7-9.5V6z" }]],
  25: [
    ["path", { d: "M2 9c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0" }],
    ["path", { d: "M2 14c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0" }],
    ["rect", { x: "14", y: "4", width: "7", height: "16", rx: "1" }],
  ],
  50: [
    ["rect", { x: "3", y: "5", width: "18", height: "14", rx: "1" }],
    ["line", { x1: "3", y1: "9.7", x2: "21", y2: "9.7" }],
    ["line", { x1: "3", y1: "14.3", x2: "21", y2: "14.3" }],
    ["line", { x1: "9", y1: "5", x2: "9", y2: "9.7" }],
    ["line", { x1: "15", y1: "5", x2: "15", y2: "9.7" }],
    ["line", { x1: "12", y1: "9.7", x2: "12", y2: "14.3" }],
    ["line", { x1: "7", y1: "14.3", x2: "7", y2: "19" }],
    ["line", { x1: "17", y1: "14.3", x2: "17", y2: "19" }],
  ],
  100: [
    ["circle", { cx: "12", cy: "12", r: "9" }],
    ["line", { x1: "7.5", y1: "12", x2: "16.5", y2: "12", strokeWidth: "3.2" }],
  ],
  250: [
    ["path", { d: "M3 21V8h3v2h2V8h3v2h2V8h3v2h2V8h3v13z" }],
    ["path", { d: "M10 21v-4a2 2 0 0 1 4 0v4" }],
  ],
  500: [
    ["path", { d: "M7 21V12h10v9" }],
    ["path", { d: "M6 12V9h2v1.5h2V9h4v1.5h2V9h2v3z" }],
    ["line", { x1: "12", y1: "9", x2: "12", y2: "2.5" }],
    ["path", { d: "M12 3l5 1.75L12 6.5" }],
  ],
  1000: [["polygon", { points: "12 3 14.8 8.8 21 9.6 16.5 14 17.6 20.2 12 17.2 6.4 20.2 7.5 14 3 9.6 9.2 8.8" }]],
};

/**
 * Icône d'un badge, la même partout : options, notification, pages et images de
 * partage. Sans `size`, elle n'a pas de dimensions : le CSS qui l'entoure les donne.
 */
export function badgeIcon(palier: Palier, size?: number): ReactElement {
  return createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: size,
      height: size,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true,
    },
    ...BADGE_ICONS[palier].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs })),
  );
}
