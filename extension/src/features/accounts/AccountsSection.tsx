// Onglet Comptes des options : en tête, la dernière mise à jour des listes
// tant qu'elle n'est pas validée, puis un onglet par réseau. X, seul réseau pris en
// charge, affiche sa liste effective et le formulaire d'ajout ; les autres sont
// grisés « Bientôt ».
import type { State } from "@/core/state.ts";
import type { XTabStatus } from "../blocking/x-tab.ts";
import { ENGINE_NETWORK } from "../networks/networks.ts";
import { NetworkTabs } from "../networks/NetworkTabs.tsx";
import { AccountList } from "./AccountList.tsx";
import { AddForm } from "./AddForm.tsx";
import { ListUpdateReview } from "./ListUpdateReview.tsx";

export function AccountsSection({ state, connection }: { state: State; connection: XTabStatus | null }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-4">Comptes</h2>
      <ListUpdateReview state={state} working={connection === "connected"} />
      <NetworkTabs
        // L'état ne porte que les comptes de X : aucun autre réseau ne doit les afficher.
        count={(network) => (network.id === ENGINE_NETWORK ? state.handles.length : 0)}
        panel={(network) =>
          network.id === ENGINE_NETWORK ? (
            <>
              <AccountList state={state} network={network} connection={connection} />
              <AddForm />
            </>
          ) : null
        }
      />
    </section>
  );
}
