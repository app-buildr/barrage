// Lien « Signaler un bug » : création d'une issue GitHub pré-remplie. Aucune
// donnée personnelle (pseudo X, comptes bloqués). Testé dans tests/bug-report.test.ts.

import { REPO_URL } from "../../core/config.ts";

type Context = { version: string; userAgent: string; tab: string; activeLists: number };

export function bugReportUrl({ version, userAgent, tab, activeLists }: Context): string {
  const body = [
    "## Ce qui s'est passé",
    "",
    "",
    "## Ce qui était attendu",
    "",
    "",
    "## Étapes pour reproduire",
    "",
    "",
    "## Informations techniques",
    "",
    `- Version de Barrage : ${version}`,
    `- Navigateur : ${userAgent}`,
    `- Onglet ouvert : ${tab}`,
    `- Listes actives : ${activeLists}`,
  ].join("\n");
  const params = `title=${encodeURIComponent("Bug : ")}&body=${encodeURIComponent(body)}`;
  return `${REPO_URL}/issues/new?${params}`;
}
