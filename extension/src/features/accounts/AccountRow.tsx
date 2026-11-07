// Une ligne de la liste de comptes : interrupteur, lien de profil, état, action.
// Mémoïsée : seules les lignes dont l'état change sont redessinées, le focus
// clavier et le défilement restent en place.
import { memo, useState } from "react";
import { Badge } from "@/ui/components/badge.tsx";
import { Button } from "@/ui/components/button.tsx";
import { Switch } from "@/ui/components/switch.tsx";
import { TableCell, TableRow } from "@/ui/components/table.tsx";
import { cn } from "@/ui/lib/utils.ts";
import type { Network } from "../networks/networks.ts";
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

function StatusLabel({ status }: { status: Status }) {
  if (!status.tag) return <>{status.label}</>;
  return (
    <>
      <Badge className={cn("px-2.5 py-0.5 text-sm leading-5 font-bold", TAG_COLORS[status.tag])}>{status.label}</Badge>
      {status.note ? <span className="ml-2 text-[13px] text-muted-foreground">{status.note}</span> : null}
    </>
  );
}

type Props = {
  network: Network;
  handle: string;
  enabled: boolean;
  status: Status;
  /** Bloqué mais sorti de la liste effective, voir offListHandles. */
  offList?: boolean;
};

/** Ce qu'affiche la ligne : une seule notion d'égalité, pour le memo et pour le bouton. */
const rowKey = ({ enabled, status, offList }: Props) => JSON.stringify([enabled, status, offList]);

function Row(props: Props) {
  const { network, handle, enabled, status, offList } = props;
  // Bouton cliqué : désactivé jusqu'au prochain changement de la ligne, ou
  // jusqu'à l'échec de l'écriture.
  const key = rowKey(props);
  const [clicked, setClicked] = useState(false);
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setClicked(false);
  }
  const action = status.action;
  const label = action === "block" ? "Bloquer" : "Débloquer";

  return (
    <TableRow className="border-line">
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
          className={cn(
            "text-base font-bold text-ink underline underline-offset-2",
            !enabled && "font-semibold text-muted-foreground",
          )}
        />
        {offList ? <p className="m-0 text-[13px] text-muted-foreground">Hors liste · n'est plus dans une liste active</p> : null}
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
              (action === "block" ? blockNow : unblockNow)(handle).catch(() => setClicked(false));
            }}
          >
            {label}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export const AccountRow = memo(Row, (a, b) => a.network === b.network && a.handle === b.handle && rowKey(a) === rowKey(b));
