// Panneau d'un réseau pas encore pris en charge : la liste seule, en lecture.
import { useMemo, useState } from "react";
import { TableCell, TableRow } from "@/ui/components/table";
import { Panel } from "@/ui/layout/Section";
import type { Network } from "../networks/networks.ts";
import { AccountTable, CELL, HEAD, TableHead } from "./AccountTable.tsx";
import { matches, noMatchMessage, normalizeQuery } from "./filter.ts";
import { ProfileLink } from "./ProfileLink.tsx";
import { SearchInput } from "./SearchInput.tsx";

export function Upcoming({ network }: { network: Network }) {
  const [search, setSearch] = useState("");
  const query = normalizeQuery(search);
  const shown = useMemo(
    () => network.defaults.filter((handle) => matches({ handle }, query, null)),
    [network.defaults, query],
  );

  return (
    <>
      <Panel className="mb-5 flex items-center gap-2.5">
        <span className="flex-none rounded-full bg-sun-soft px-2 py-px text-[13px] font-bold text-sun-soft-ink">
          Bientôt disponible
        </span>
        <span>
          Le blocage sur {network.label} n'est pas encore pris en charge. Ces comptes seront bloqués dès son
          arrivée, avec les mêmes réglages que pour X.
        </span>
      </Panel>
      <SearchInput label={`Rechercher un compte ${network.label}`} value={search} onChange={setSearch} />
      <AccountTable
        className="mt-5"
        empty={query && !shown.length ? noMatchMessage(query) : null}
        head={
          <>
            <TableHead className={HEAD}>Compte</TableHead>
            <TableHead className={HEAD}>État</TableHead>
          </>
        }
      >
        {shown.map((handle) => (
          <TableRow key={handle} className="border-line">
            <TableCell className={CELL}>
              <ProfileLink network={network.id} handle={handle} className="text-base font-bold text-ink" />
            </TableCell>
            <TableCell className={`${CELL} text-sun-soft-ink`}>Bientôt disponible</TableCell>
          </TableRow>
        ))}
      </AccountTable>
    </>
  );
}
