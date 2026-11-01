// Carte de progression : comptes bloqués sur le total, barre de remplissage, et
// compte X dont les états sont affichés (le dernier connecté sur x.com).
import { Progress } from "@/ui/components/progress";
import { Panel } from "@/ui/layout/Section";
import { totalCount, type Counts } from "./status.ts";

export function ProgressCard({ counts, handle }: { counts: Counts; handle: string | undefined }) {
  const total = totalCount(counts);
  return (
    <Panel className="mb-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-[52px] leading-none font-extrabold tracking-tight text-coral-deep">
          {counts.blocked}
        </span>
        <span className="flex-1 text-lg text-muted-foreground">
          bloqués sur {total} compte{total > 1 ? "s" : ""}
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
        value={total ? (counts.blocked / total) * 100 : 0}
        aria-label={`${counts.blocked} bloqués, ${counts.visible} visibles, ${counts.problem} problèmes, ${counts.disabled} désactivés`}
        className="h-3 bg-line [&>[data-slot=progress-indicator]]:rounded-full [&>[data-slot=progress-indicator]]:bg-coral"
      />
    </Panel>
  );
}
