// Service worker : ouvre l'accueil ou les options. Il n'y a pas de popup.
import { isOpenBadgesRequest } from "../../core/messages.ts";
import { getState } from "../../core/state.ts";
import type { Route } from "../../ui/layout/main-tab.ts";

const PAGE = "options.html";

/** Un onglet déjà ouvert sur la page d'options est réutilisé plutôt que dupliqué. */
async function openPage(hash: Route): Promise<void> {
  const url = chrome.runtime.getURL(`${PAGE}#${hash}`);
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.TAB] });
  const open = contexts.find((context) => context.documentUrl?.startsWith(chrome.runtime.getURL(PAGE)));
  if (!open) {
    await chrome.tabs.create({ url });
    return;
  }
  await chrome.tabs.update(open.tabId, { url, active: true });
  await chrome.windows.update(open.windowId, { focused: true });
}

export function servePages(): void {
  // Des comptes retirés des listes attendent un choix : l'onglet Comptes, où il
  // se fait, plutôt que le dernier onglet ouvert. Voir action-badge.ts.
  chrome.action.onClicked.addListener(() => {
    void getState().then(({ onboarded, retired }) => {
      if (!onboarded) void openPage("accueil");
      else if (retired.length) void openPage("comptes");
      else void chrome.runtime.openOptionsPage();
    });
  });
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isOpenBadgesRequest(message)) void openPage("badges");
    return false;
  });
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") void openPage("accueil");
  });
}
