// Page de secours des options : sans elle, une lecture ratée ou une exception de
// rendu laisseraient une page vide, sans message.
import { Component, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { CORAL_LINK } from "@/ui/classes.ts";
import { useReveal } from "@/ui/use-reveal.ts";
import { bugReportUrl } from "./bug-report.ts";
import { Header } from "./Header.tsx";
import { Callout } from "./Section.tsx";

export function StartupError({ message }: { message: string }) {
  useReveal(true);
  const bugUrl = bugReportUrl({
    version: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
    tab: "page d'erreur",
  });
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-9 px-6 pt-12 pb-16 *:min-w-0">
      <Header />
      <main>
        <Callout
          role="alert"
          tone="alert"
          icon={CircleAlert}
          title="Barrage ne s'est pas ouvert"
          action={
            <a href={bugUrl} target="_blank" rel="noopener" className={`${CORAL_LINK} whitespace-nowrap`}>
              Signaler un bug
            </a>
          }
        >
          {message}
        </Callout>
      </main>
    </div>
  );
}

/** Une exception de rendu sur un état inattendu ne laisse pas la page vide. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error("[Barrage]", error);
  }

  override render() {
    if (this.state.failed) return <StartupError message="Cette page n'a pas pu s'afficher : rechargez-la." />;
    return this.props.children;
  }
}
