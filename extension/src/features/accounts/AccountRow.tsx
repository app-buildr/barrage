// Une ligne de la liste de comptes : interrupteur, lien de profil, état, action.
// Mémoïsée : seules les lignes dont l'état change sont redessinées, le focus
// clavier et le défilement restent en place.
import { memo, useState } from "react";
import { Badge } from "@/ui/components/badge";
import { Button } from "@/ui/components/button";
import { Switch } from "@/ui/components/switch";
import { TableCell, TableRow } from "@/ui/components/table";
import { cn } from "@/ui/lib/utils";
import type { NetworkId } from "../networks/networks.ts";
import { blockNow, toggle, unblockNow } from "./actions.ts";
import { CELL } from "./AccountTable.tsx";
import { ProfileLink } from "./ProfileLink.tsx";
import type { Status } from "./status.ts";

/** Couleur d'un état affiché en texte, voir Status.className. */
const TEXT_COLORS: Record<string, string> = {
  muted: "text-muted-foreground",
  warn: "text-sun-soft-ink",
  error: "text-state-problem",
};

const TAG_COLORS = {
  blocked: "bg-coral-soft text-coral-deep",
  visible: "bg-sun-soft text-sun-soft-ink",
} as const;

export function StatusLabel({ status }: { status: Status }) {
  if (!status.tag) return <>{status.label}</>;
  return (
    <>
      <Badge className={cn("px-2.5 py-0.5 text-sm leading-5 font-bold", TAG_COLORS[status.tag])}>{status.label}</Badge>
      {status.note ? <span className="ml-2 text-[13px] text-muted-foreground">{status.note}</span> : null}
    </>
  );
}

type Props = { network: NetworkId; handle: string; enabled: boolean; status: Status };

function Row({ network, handle, enabled, status }: Props) {
  // Bouton cliqué : désactivé jusqu'au prochain changement d'état.
  const statusKey = JSON.stringify(status);
  const [clicked, setClicked] = useState(false);
  const [shownKey, setShownKey] = useState(statusKey);
  if (shownKey !== statusKey) {
    setShownKey(statusKey);
    setClicked(false);
  }
  const action = status.action;
  const label = action === "block" ? "Bloquer" : "Débloquer";

  return (
    <TableRow className={cn("border-line", !enabled && "disabled")}>
      <TableCell className={cn(CELL, "w-[1%] pr-2")}>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => void toggle(handle, checked)}
          aria-label={`Blocage automatique de @${handle}`}
        />
      </TableCell>
      <TableCell className={CELL}>
        <ProfileLink
          network={network}
          handle={handle}
          className={cn("text-base font-bold text-ink", !enabled && "font-semibold text-muted-foreground")}
        />
      </TableCell>
      <TableCell className={cn(CELL, "whitespace-normal", TEXT_COLORS[status.className])}>
        <StatusLabel status={status} />
      </TableCell>
      <TableCell className={cn(CELL, "w-[1%] text-right")}>
        {action ? (
          <Button
            variant={action === "block" ? "default" : "outline"}
            aria-label={`${label} @${handle}`}
            disabled={clicked}
            onClick={() => {
              setClicked(true);
              void (action === "block" ? blockNow : unblockNow)(handle);
            }}
          >
            {label}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

const sameStatus = (a: Status, b: Status) =>
  a.label === b.label && a.className === b.className && a.action === b.action && a.tag === b.tag && a.note === b.note;

export const AccountRow = memo(
  Row,
  (a, b) => a.network === b.network && a.handle === b.handle && a.enabled === b.enabled && sameStatus(a.status, b.status),
);
