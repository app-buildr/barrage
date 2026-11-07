// Page d'options : assemblage seulement. Chaque onglet appartient à sa
// fonctionnalité et se redessine à chaque changement de l'état stocké.
import "../ui/fonts.css";
import "../ui/globals.css";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { REFRESH_LISTS, type Message } from "@/core/messages.ts";
import type { State } from "@/core/state.ts";
import { useExtensionState } from "@/ui/use-extension-state.ts";
import { AccountsSection } from "@/features/accounts/AccountsSection.tsx";
import { BackgroundAlert } from "@/features/accounts/BackgroundAlert.tsx";
import { BackupSettings } from "@/features/backup/BackupSettings.tsx";
import { BADGES, earnedCount } from "@/features/badges/badges.ts";
import { BadgesTab } from "@/features/badges/BadgesTab.tsx";
import { ConnectionBadge } from "@/features/blocking/ConnectionBadge.tsx";
import { ListsSettings } from "@/features/lists/ListsSettings.tsx";
import { NotificationSettings } from "@/features/notifications/NotificationSettings.tsx";
import { useMainRoute } from "@/ui/layout/use-main-route.ts";
import { Welcome } from "@/features/onboarding/Welcome.tsx";
import { UpdateBanner } from "@/features/updates/UpdateBanner.tsx";
import { Tabs, TabsContent } from "@/ui/components/tabs.tsx";
import { Footer } from "@/ui/layout/Footer.tsx";
import { Header } from "@/ui/layout/Header.tsx";
import { MAIN_TABS, type MainTab } from "@/ui/layout/main-tab.ts";
import { MainTabList } from "@/ui/layout/MainTabs.tsx";
import { ErrorBoundary, StartupError } from "@/ui/layout/StartupError.tsx";
import { useReveal } from "@/ui/use-reveal.ts";

/** Panneau gardé monté : recherche, filtre et saisie en cours sont retrouvés au retour. */
const PANEL = "flex flex-col gap-9 data-[state=inactive]:hidden *:min-w-0";

function Options({ state, tab }: { state: State; tab: MainTab }) {
  const panels: Record<MainTab, ReactNode> = {
    comptes: <AccountsSection state={state} />,
    badges: <BadgesTab state={state} />,
    reglages: (
      <>
        <ListsSettings state={state} />
        <NotificationSettings notify={state.notify} notifyBadges={state.notifyBadges} />
        <BackupSettings />
      </>
    ),
  };
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-9 px-6 pt-12 pb-16 *:min-w-0">
      <Header>
        <ConnectionBadge />
      </Header>
      <UpdateBanner latestVersion={state.latestVersion} />
      <BackgroundAlert error={state.error} pauseUntil={state.pauseUntil} />
      <Tabs
        value={tab}
        onValueChange={(next) => {
          location.hash = next;
        }}
        className="gap-9"
      >
        <MainTabList tab={tab} badgesLabel={`Badges ${earnedCount(state.badges)}/${BADGES.length}`} />
        <div className="tab-content min-w-0">
          {MAIN_TABS.map((value) => (
            <TabsContent key={value} value={value} forceMount className={PANEL}>
              {panels[value]}
            </TabsContent>
          ))}
        </div>
      </Tabs>
      <Footer tab={tab} activeLists={state.lists.filter((list) => list.active).length} />
    </div>
  );
}

function OptionsApp() {
  const { state, failed } = useExtensionState();
  const { tab, welcome } = useMainRoute(state?.onboarded);
  useReveal(welcome !== null);

  if (!state && failed) return <StartupError message="Impossible de lire les données : rechargez la page." />;
  if (!state || welcome === null) return null;
  return welcome ? (
    <div className="tab-content">
      <Welcome state={state} />
    </div>
  ) : (
    <Options state={state} tab={tab} />
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <OptionsApp />
    </ErrorBoundary>
  </StrictMode>,
);

// Les listes en ligne sont revérifiées à chaque ouverture des options ; un
// changement arrive par onStateChange.
void chrome.runtime.sendMessage({ type: REFRESH_LISTS } satisfies Message).catch(() => {});
