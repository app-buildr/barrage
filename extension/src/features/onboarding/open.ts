// Service worker : ouvre l'accueil ou les options. Il n'y a pas de popup.
import { isOpenBadgesRequest } from "../../core/messages.ts";
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
  chrome.action.onClicked.addListener(() => {
    void chrome.storage.local.get({ onboarded: false }).then(({ onboarded }) => {
      if (onboarded === true) void chrome.runtime.openOptionsPage();
      else void openPage("accueil");
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
