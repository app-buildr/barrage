// État des onglets x.com, vérifié à l'ouverture des options, puis quand un onglet
// x.com se charge ou se ferme.
import { useEffect, useState } from "react";
import { X_MATCHES, X_ORIGINS } from "../networks/networks.ts";
import { xTabStatus, type XTabStatus } from "./x-tab.ts";

const isXUrl = (url: string | undefined) => url !== undefined && X_ORIGINS.some((origin) => url.startsWith(`${origin}/`));

/** null le temps de la première vérification. */
export function useXConnection(): XTabStatus | null {
  const [status, setStatus] = useState<XTabStatus | null>(null);

  useEffect(() => {
    let alive = true;
    /** Onglets x.com connus, pour ne revérifier qu'à la fermeture de l'un d'eux. */
    const xTabs = new Set<number>();

    async function check(): Promise<void> {
      const next = await xTabStatus().catch((): XTabStatus => "none");
      if (alive) setStatus(next);
    }

    // Les autres onglets du navigateur ne changent rien à la pastille.
    const onUpdated = (id: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (info.status !== "complete") return;
      if (isXUrl(tab.url)) xTabs.add(id);
      else if (!xTabs.delete(id)) return;
      void check();
    };
    const onRemoved = (id: number) => {
      if (xTabs.delete(id)) void check();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    void chrome.tabs.query({ url: X_MATCHES }).then((tabs) => {
      for (const tab of tabs) if (tab.id !== undefined) xTabs.add(tab.id);
    });
    void check();

    return () => {
      alive = false;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };
  }, []);

  return status;
}
