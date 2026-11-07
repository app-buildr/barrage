// Onglets principaux des options, portés par le hash de l'URL. Fonctions pures,
// testées dans tests/format.test.ts.

export const MAIN_TABS = ["comptes", "badges", "reglages"] as const;

export type MainTab = (typeof MAIN_TABS)[number];

/** Écrans de la page d'options : les onglets, et l'accueil qui les précède. */
export type Route = MainTab | "accueil";

export const TAB_LABELS: Record<MainTab, string> = { comptes: "Comptes", badges: "Badges", reglages: "Réglages" };

export const routeHash = (route: Route): string => `#${route}`;

/** Titre de l'onglet du navigateur. */
export const pageTitle = (route: Route): string =>
  route === "accueil" ? "Bienvenue sur Barrage" : `${TAB_LABELS[route]} · Barrage`;

export function tabFromHash(hash: string): MainTab {
  return MAIN_TABS.find((tab) => routeHash(tab) === hash) ?? "comptes";
}
