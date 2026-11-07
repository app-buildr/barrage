// Page de secours des options : sans elle, une lecture ratée ou une exception de
// rendu laisseraient une page vide, sans message.
import { Component, type ReactNode } from "react";
import { useReveal } from "@/ui/use-reveal.ts";
import { bugReportUrl } from "./bug-report.ts";

export function StartupError({ message }: { message: string }) {
  useReveal(true);
  const bugUrl = bugReportUrl({
    version: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
    tab: "page d'erreur",
  });
  return (
    <div role="alert" className="mx-auto flex max-w-[860px] flex-col gap-3 px-6 pt-12 pb-16 text-base text-ink">
      <p className="m-0 font-bold">{message}</p>
      <a href={bugUrl} target="_blank" rel="noopener" className="text-muted-foreground underline underline-offset-2">
        Signaler un bug
      </a>
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
