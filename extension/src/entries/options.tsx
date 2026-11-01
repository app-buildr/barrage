// Page d'options : assemblage seulement. Chaque section appartient à sa
// fonctionnalité et se redessine à chaque changement de l'état stocké.
import "../ui/fonts.css";
import "../ui/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { REFRESH_LISTS } from "@/core/messages.ts";
import { useExtensionState } from "@/core/use-extension-state.ts";
import { AccountsSection } from "@/features/accounts/AccountsSection.tsx";
import { ConnectionBadge } from "@/features/blocking/ConnectionBadge.tsx";
import { NotificationSettings } from "@/features/notifications/NotificationSettings.tsx";
import { UpdateBanner } from "@/features/updates/UpdateBanner.tsx";
import { Footer } from "@/ui/layout/Footer.tsx";
import { Header } from "@/ui/layout/Header.tsx";

function OptionsApp() {
  const state = useExtensionState();
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-9 px-6 pt-12 pb-16 *:min-w-0">
      <Header>
        <ConnectionBadge />
      </Header>
      {state ? (
        <main className="flex flex-col gap-9 *:min-w-0">
          <UpdateBanner latestVersion={state.latestVersion} />
          <NotificationSettings notify={state.notify} />
          <AccountsSection state={state} />
        </main>
      ) : null}
      <Footer />
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);

// La liste partagée est revérifiée à chaque ouverture des options ; un
// changement arrive par onStateChange.
void chrome.runtime.sendMessage({ type: REFRESH_LISTS }).catch(() => {});
