// Tableau de comptes dans une carte : en-tête figé, défilement vertical, message
// quand le filtre ne laisse rien.
import type { ReactNode } from "react";
import { OVERLINE } from "@/ui/classes.ts";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/ui/components/table.tsx";
import { cn } from "@/ui/lib/utils.ts";

/** Cellules : mêmes marges partout, réduites sur petit écran. */
export const CELL = "px-6 py-3.5 max-xs:px-3 max-xs:py-2.5";

const HEAD = cn(
  CELL,
  OVERLINE,
  "sticky top-0 z-2 h-auto bg-cream text-label text-muted-foreground",
  "shadow-[inset_0_-1px_0_var(--color-line)]",
);

export function AccountTable({ children, empty }: { children: ReactNode; empty?: string | null }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-card shadow-soft">
      <Table containerClassName="max-h-[600px] overflow-auto" className="text-body">
        <TableHeader className="[&_tr]:border-0">
          <TableRow className="hover:bg-transparent">
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
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
      {empty ? <p className="m-0 px-6 py-4 text-muted-foreground">{empty}</p> : null}
    </div>
  );
}
