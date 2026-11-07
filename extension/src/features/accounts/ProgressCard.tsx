// Carte de progression : comptes bloqués sur le total, barre de remplissage,
// compte X dont les états sont affichés (le dernier connecté sur x.com), et
// avancée de la synchronisation avec les blocages déjà faits sur X.
import type * as React from "react";
import { LoaderCircle, Pause } from "lucide-react";
import { formatCount, percent, plural, pluralWord } from "@/core/format.ts";
import { formatClock } from "@/core/intl.ts";
import { CORAL_LINK } from "@/ui/classes.ts";
import { Progress } from "@/ui/components/progress.tsx";
import { Panel } from "@/ui/layout/Section.tsx";
import { X_HOME_URL } from "../networks/networks.ts";
import { totalCount, type Counts } from "./status.ts";
import type { SyncPause, SyncStatus } from "./sync-status.ts";

type Props = { counts: Counts; handle: string | undefined; sync: SyncStatus | null };

export function ProgressCard({ counts, handle, sync }: Props) {
  const total = totalCount(counts);
  return (
    <Panel className="mb-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-[52px] leading-none font-extrabold tracking-tight text-coral-deep">
          {formatCount(counts.blocked)}
        </span>
        <span className="flex-1 text-lg text-muted-foreground">
          {pluralWord(counts.blocked, "bloqué")} sur {plural(total, "compte")}
        </span>
        <span
          className="text-sm text-muted-foreground"
          title={handle ? `États du compte X connecté sur x.com : @${handle}.` : undefined}
        >
          {handle ? (
            <>
              sur <strong className="text-ink">@{handle}</strong>
            </>
          ) : null}
        </span>
      </div>
      <Progress
        value={percent(counts.blocked, total)}
        aria-label={`${plural(counts.blocked, "bloqué")}, ${plural(counts.visible, "visible")}, ${plural(counts.problem, "problème")}, ${plural(counts.disabled, "désactivé")}`}
        className="h-3"
      />
      {sync ? <SyncLine sync={sync} /> : null}
    </Panel>
  );
}

const OPEN_X = (
  <a href={X_HOME_URL} target="_blank" rel="noopener" className={CORAL_LINK}>
    Ouvrir x.com
  </a>
);

function pauseHint(pause: SyncPause): React.ReactNode {
  switch (pause.reason) {
    case "no_tab":
      return <>Gardez un onglet x.com ouvert et connecté pour la poursuivre. {OPEN_X}</>;
    case "limit":
      return `X limite les vérifications : reprise vers ${formatClock(pause.until)}.`;
    case "error":
      return "Le blocage est arrêté : voir le message en haut de la page.";
  }
}

/** Où en est la recherche des comptes que l'utilisateur bloquait déjà sur X. */
function SyncLine({ sync }: { sync: SyncStatus }) {
  const running = sync.kind === "syncing";
  const Icon = running ? LoaderCircle : Pause;
  return (
    <div className="mt-4 flex items-start gap-3 rounded-icon bg-cream px-4 py-3 text-body">
      <Icon
        className={
          running
            ? "mt-0.5 size-4 flex-none animate-spin text-coral-deep motion-reduce:animate-none"
            : "mt-0.5 size-4 flex-none text-muted-foreground"
        }
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        {sync.kind === "no_account" ? (
          <p className="m-0 text-ink">
            <strong role="status">Synchronisation en attente.</strong> Connectez-vous sur x.com : Barrage y repérera les
            comptes de vos listes que vous bloquez déjà. {OPEN_X}
          </p>
        ) : (
          <>
            <p className="m-0 text-ink">
              {/* Seul ce court résumé est annoncé : le reste changerait l'annonce à chaque minute. */}
              <span role="status">
                <strong>{running ? "Synchronisation avec X en cours" : "Synchronisation en pause"}</strong>
                {" · "}
                {formatCount(sync.checked)} sur {plural(sync.total, "compte vérifié", "comptes vérifiés")}
              </span>
              {running ? ` · ${sync.atLeast ? "au moins" : "environ"} ${sync.minutesLeft} min` : null}
            </p>
            <p className="m-0 mt-1 text-label text-muted-foreground">
              {running
                ? "Barrage repère les comptes de vos listes que vous bloquez déjà. Vos autres blocages ne sont pas concernés."
                : pauseHint(sync.pause)}
            </p>
            <Progress value={percent(sync.checked, sync.total)} aria-hidden="true" className="mt-2 h-1" />
          </>
        )}
      </div>
    </div>
  );
}
