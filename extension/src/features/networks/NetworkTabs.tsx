// Onglets des réseaux sociaux : un onglet et un panneau par entrée de NETWORKS.
// Clavier (flèches, Début, Fin) géré par Radix. Un réseau pas encore disponible
// a un onglet grisé « Bientôt », que ni le clic ni le clavier n'ouvrent.
import { useState, type ReactNode } from "react";
import { formatCount } from "@/core/format.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/components/tabs.tsx";
import { AVAILABLE_NETWORKS, ENGINE_NETWORK, NETWORKS, toNetworkId, type Network, type NetworkId } from "./networks.ts";

type Props = {
  /** Nombre affiché dans l'onglet d'un réseau disponible. */
  count: (network: Network) => number;
  /** Contenu du panneau d'un réseau disponible. */
  panel: (network: Network) => ReactNode;
};

export function NetworkTabs({ count, panel }: Props) {
  const [tab, setTab] = useState<NetworkId>(ENGINE_NETWORK);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(toNetworkId(value))} className="gap-0">
      <TabsList
        aria-label="Réseaux sociaux"
        className="mb-5 h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto"
      >
        {NETWORKS.map((network) => (
          <TabsTrigger
            key={network.id}
            value={network.id}
            disabled={!network.available}
            title={network.available ? undefined : "Bientôt disponible"}
            className={[
              "h-11 flex-none gap-2.5 rounded-full border-line bg-card px-4 text-body font-bold text-ink hover:bg-cream hover:text-ink",
              "data-[state=active]:border-ink data-[state=active]:bg-ink data-[state=active]:text-white",
              "disabled:pointer-events-auto disabled:cursor-not-allowed disabled:border-dashed disabled:border-line-strong disabled:bg-cream-2 disabled:font-semibold disabled:text-disabled disabled:opacity-100",
            ].join(" ")}
          >
            <span>{network.label}</span>
            {network.available ? (
              <span className="rounded-full bg-cream px-2 py-px text-xs font-bold text-muted-foreground in-data-[state=active]:bg-white/20 in-data-[state=active]:text-white">
                {formatCount(count(network))}
              </span>
            ) : (
              <span className="rounded-full bg-soon px-2 py-px text-xs font-bold text-disabled">Bientôt</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {AVAILABLE_NETWORKS.map((network) => (
        // Panneau inactif caché mais gardé : recherche, filtre et saisie en
        // cours sont retrouvés en revenant sur l'onglet.
        <TabsContent key={network.id} value={network.id} forceMount className="data-[state=inactive]:hidden">
          {panel(network)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
