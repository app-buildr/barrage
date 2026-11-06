// Onglets principaux des options, portés par le hash de l'URL. Fonctions pures,
// testées dans tests/format.test.ts.

const MAIN_TABS = ["comptes", "badges", "reglages"] as const;

export type MainTab = (typeof MAIN_TABS)[number];

export function tabFromHash(hash: string): MainTab {
  return MAIN_TABS.find((tab) => `#${tab}` === hash) ?? "comptes";
}
