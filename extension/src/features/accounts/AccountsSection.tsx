// Section « Comptes » des options : un onglet par réseau. X, seul réseau pris
// en charge, affiche la liste de l'état et le formulaire d'ajout ; les autres
// réseaux disponibles, leur liste à venir.
import type { State } from "@/core/state.ts";
import { NetworkTabs } from "../networks/NetworkTabs.tsx";
import { AccountList } from "./AccountList.tsx";
import { AddForm } from "./AddForm.tsx";
import { Upcoming } from "./Upcoming.tsx";

export function AccountsSection({ state }: { state: State }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-4 text-2xl leading-tight">Comptes</h2>
      <NetworkTabs
        count={(network) => (network.id === "x" ? state.handles.length : network.defaults.length)}
        panel={(network) =>
          network.id === "x" ? (
            <>
              <AccountList state={state} network={network} />
              <AddForm />
            </>
          ) : (
            <Upcoming network={network} />
          )
        }
      />
    </section>
  );
}
