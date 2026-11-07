// Pied de la page d'options : demande de retrait de la liste, liens vers le dépôt.
import { CONTACT_EMAIL, REPO_URL } from "@/core/config.ts";
import { bugReportUrl } from "./bug-report.ts";

const LINK = "inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-2 hover:text-ink";

export function Footer({ tab, activeLists }: { tab: string; activeLists: number }) {
  const bugUrl = bugReportUrl({
    version: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
    tab,
    activeLists,
  });
  return (
    <footer className="page-footer flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-body">
      <a href={`mailto:${CONTACT_EMAIL}?subject=Demande%20de%20retrait%20de%20la%20liste`} className={LINK}>
        Demander un retrait de la liste
      </a>
      <a href={REPO_URL} target="_blank" rel="noopener" className={LINK}>
        Code source et liste sur GitHub
      </a>
      <a href={bugUrl} target="_blank" rel="noopener" className={LINK}>
        Signaler un bug
      </a>
    </footer>
  );
}
