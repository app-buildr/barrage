// Liste des comptes d'un réseau pris en charge : encart info, progression, recherche, filtres par état et tableau. Elle porte sur la liste
// effective, plus les comptes bloqués qui en sont sortis (« hors liste »).
import { useDeferredValue, useMemo, useState } from "react";
import { plural } from "@/core/format.ts";
import type { State } from "@/core/state.ts";
import { CORAL_BUTTON, CORAL_LINK } from "@/ui/classes.ts";
import { routeHash } from "@/ui/layout/main-tab.ts";
import { Panel, StatusMessage } from "@/ui/layout/Section.tsx";
import { cn } from "@/ui/lib/utils.ts";
import { useSafeWrite } from "@/ui/use-safe-write.ts";
import { coversNetwork } from "../lists/lists.ts";
import type { Network } from "../networks/networks.ts";
import { AccountRow } from "./AccountRow.tsx";
import { AccountTable } from "./AccountTable.tsx";
import { matches, noMatchMessage, normalizeQuery } from "./filter.ts";
import { ProgressCard } from "./ProgressCard.tsx";
import { SearchInput } from "./SearchInput.tsx";
import { StatusChips } from "./StatusChips.tsx";
import { accountLines, lineCounts } from "./lines.ts";
import type { Category } from "./status.ts";
import { Tip } from "./Tip.tsx";

type Props = {
  state: State;
  network: Network;
  /** Un onglet x.com connecté peut traiter la file. */
  working: boolean;
};

export function AccountList({ state, network, working }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  // Le champ suit la frappe ; le tableau (jusqu'à ~1 400 lignes) suit dès que possible.
  const query = useDeferredValue(normalizeQuery(search));

  // Une seule fois ici : `attempt`, stable, laisse les lignes mémoïsées en place.
  const { error, attempt } = useSafeWrite();

  const lines = useMemo(() => accountLines(state, working), [state, working]);
  const counts = useMemo(() => lineCounts(lines), [lines]);
  const noActiveList = !state.lists.some((list) => coversNetwork(list, network.id));
  const shown = useMemo(() => lines.filter((line) => matches(line, query, category)), [lines, query, category]);
  const handle = state.account ? state.accounts[state.account]?.handle : undefined;
  const filtered = Boolean(query || category) && shown.length > 0;

  return (
    <>
      <p className="mb-5 text-body text-muted-foreground">
        L'interrupteur <strong className="text-ink">Blocage automatique</strong> est actif par défaut. Désactivez-le
        pour que Barrage ignore un compte, et le débloque s'il l'avait bloqué.
      </p>
      <Tip />
      {noActiveList ? (
        <Panel className="mb-5">
          Aucune liste active.{" "}
          <a href={routeHash("reglages")} className={CORAL_LINK}>
            Activez une liste dans Réglages
          </a>{" "}
          pour commencer à bloquer.
        </Panel>
      ) : (
        <ProgressCard counts={counts.listed} handle={handle} />
      )}
      {lines.length ? (
        <>
          <SearchInput label={`Rechercher un compte ${network.label}`} value={search} onChange={setSearch} />
          <StatusChips counts={counts.all} selected={category} onSelect={setCategory} />
          <StatusMessage
            className="sr-only"
            message={filtered ? `${plural(shown.length, "compte affiché", "comptes affichés")}.` : null}
          />
          <StatusMessage kind="error" message={error} className="mb-3" />
          {/* Pas de lien : le hash pilote les onglets. Sinon, jusqu'à trois arrêts par ligne avant le formulaire. */}
          <button
            type="button"
            onClick={() => document.getElementById("addInput")?.focus()}
            className={cn(CORAL_BUTTON, "sr-only focus:not-sr-only focus:mb-3 focus:inline-block")}
          >
            Aller à l'ajout de comptes
          </button>
          <AccountTable empty={(query || category) && !shown.length ? noMatchMessage(query) : null}>
            {shown.map((line) => (
              <AccountRow
                key={line.handle}
                network={network}
                handle={line.handle}
                enabled={line.enabled}
                status={line.status}
                offList={line.offList}
                attempt={attempt}
              />
            ))}
          </AccountTable>
        </>
      ) : null}
    </>
  );
}
