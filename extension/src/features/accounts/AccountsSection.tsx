// Onglet Comptes des options : un onglet par réseau. X, seul réseau pris en
// charge, affiche sa liste effective et le formulaire d'ajout ; les autres sont
// grisés « Bientôt ».
import type { State } from "@/core/state.ts";
import { NetworkTabs } from "../networks/NetworkTabs.tsx";
import { AccountList } from "./AccountList.tsx";
import { AddForm } from "./AddForm.tsx";

export function AccountsSection({ state }: { state: State }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-4 text-2xl leading-tight">Comptes</h2>
      <NetworkTabs
        count={() => state.handles.length}
        panel={(network) => (
          <>
            <AccountList state={state} network={network} />
            <AddForm />
          </>
        )}
      />
    </section>
  );
}
