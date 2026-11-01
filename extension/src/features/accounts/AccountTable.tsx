// Tableau de comptes dans une carte : en-tête figé, défilement vertical, message
// quand le filtre ne laisse rien.
import type { ReactNode } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/ui/components/table";
import { cn } from "@/ui/lib/utils";

/** Cellules : mêmes marges partout, réduites sur petit écran. */
export const CELL = "px-6 py-3.5 max-[560px]:px-3 max-[560px]:py-2.5";

export const HEAD = cn(
  CELL,
  "sticky top-0 z-2 h-auto bg-cream text-[13px] font-bold tracking-[.04em] text-muted-foreground uppercase",
  "shadow-[inset_0_-1px_0_var(--color-line)]",
);

type Props = { head: ReactNode; children: ReactNode; empty?: string | null; className?: string };

export function AccountTable({ head, children, empty, className }: Props) {
  return (
    <div className={cn("overflow-hidden rounded-card border border-line bg-card shadow-soft", className)}>
      <Table containerClassName="max-h-[600px] overflow-auto" className="text-[15px]">
        <TableHeader className="[&_tr]:border-0">
          <TableRow className="hover:bg-transparent">{head}</TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
      {empty ? <p className="m-0 px-6 py-4 text-muted-foreground">{empty}</p> : null}
    </div>
  );
}

export { TableHead };
