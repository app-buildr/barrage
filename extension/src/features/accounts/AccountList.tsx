// Liste des comptes d'un réseau pris en charge : encart info, alerte de fond,
// progression, recherche, filtres par état et tableau.
import { useDeferredValue, useMemo, useState } from "react";
import { unblockQueue, type State } from "@/core/state.ts";
import { resultOf } from "../blocking/queue.ts";
import type { Network } from "../networks/networks.ts";
import { AccountRow } from "./AccountRow.tsx";
import { AccountTable, HEAD, TableHead } from "./AccountTable.tsx";
import { BackgroundAlert } from "./BackgroundAlert.tsx";
import { matches, noMatchMessage, normalizeQuery } from "./filter.ts";
import { ProgressCard } from "./ProgressCard.tsx";
import { SearchInput } from "./SearchInput.tsx";
import { StatusChips } from "./StatusChips.tsx";
import { countCategories, describe, describeDisabled, type Category } from "./status.ts";
import { Tip } from "./Tip.tsx";

export function AccountList({ state, network }: { state: State; network: Network }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  // Le champ suit la frappe ; le tableau (jusqu'à ~1 400 lignes) suit dès que possible.
  const query = useDeferredValue(normalizeQuery(search));

  const lines = useMemo(() => {
    const queued = new Set(state.seen);
    const disabled = new Set(state.disabled);
    const unblocking = new Set(unblockQueue(state));
    return state.handles.map((handle) => {
      const result = resultOf(state.results, handle);
      const enabled = !disabled.has(handle);
      const status = enabled
        ? describe(result, queued.has(handle))
        : describeDisabled(result, unblocking.has(handle));
      return { handle, enabled, status, category: status.category };
    });
  }, [state]);

  const counts = useMemo(() => countCategories(lines.map((l) => l.status)), [lines]);
  const shown = useMemo(() => lines.filter((line) => matches(line, query, category)), [lines, query, category]);
  const handle = state.account ? state.accounts[state.account]?.handle : undefined;

  return (
    <>
      <p className="mb-5 text-[15px] text-muted-foreground">
        L'interrupteur <strong className="text-ink">Blocage automatique</strong> est actif par défaut. Désactivez-le
        pour que Barrage ignore un compte, et le débloque s'il l'avait bloqué.
      </p>
      <Tip />
      <BackgroundAlert error={state.error} />
      <ProgressCard counts={counts} handle={handle} />
      <SearchInput label={`Rechercher un compte ${network.label}`} value={search} onChange={setSearch} />
      <StatusChips counts={counts} selected={category} onSelect={setCategory} />
      <AccountTable
        empty={(query || category) && !shown.length ? noMatchMessage(query) : null}
        head={
          <>
            <TableHead className={`${HEAD} w-[1%] pr-2`}>
              <abbr title="Blocage automatique" className="no-underline">
                Blocage auto
              </abbr>
            </TableHead>
            <TableHead className={HEAD}>Compte</TableHead>
            <TableHead className={HEAD}>État</TableHead>
            <TableHead className={`${HEAD} w-[1%] text-right`}>
              <span className="sr-only">Action</span>
            </TableHead>
          </>
        }
      >
        {shown.map((line) => (
          <AccountRow
            key={line.handle}
            network={network.id}
            handle={line.handle}
            enabled={line.enabled}
            status={line.status}
          />
        ))}
      </AccountTable>
    </>
  );
}
