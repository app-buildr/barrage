// Onglet Badges des options, pour le compte X affiché.
import { Check } from "lucide-react";
import type { State } from "@/core/state.ts";
import { percent } from "@/core/format.ts";
import { CORAL_LINK, PROGRESS_BAR, TO_REACH } from "@/ui/classes.ts";
import { Progress } from "@/ui/components/progress";
import { Panel } from "@/ui/layout/Section";
import { cn } from "@/ui/lib/utils";
import { BADGES, earnedCount, hasBadge, nextBadge, shareUrl, type Badge } from "./badges.ts";
import { BadgeDisc } from "./BadgeDisc.tsx";

function Tile({ badge, count, earned }: { badge: Badge; count: number; earned: boolean }) {
  return (
    <li className="flex flex-col gap-3 rounded-step border border-line p-5">
      <div className="flex items-center gap-3">
        <BadgeDisc palier={badge.palier} earned={earned} />
        <span className="min-w-0 flex-1 text-lg font-bold text-ink">{badge.name}</span>
        <span
          role="img"
          aria-label={earned ? "Badge obtenu" : "Badge pas encore obtenu"}
          className={cn(
            "grid size-6 flex-none place-items-center rounded-full",
            earned ? "bg-obtained text-white" : TO_REACH,
          )}
        >
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
      </div>
      <p className="m-0 text-[15px] text-muted-foreground">{badge.description}</p>
      {earned ? (
        <a
          href={shareUrl(badge)}
          target="_blank"
          rel="noopener"
          aria-label={`Partager le badge ${badge.name} sur X`}
          className={CORAL_LINK}
        >
          Partager sur X →
        </a>
      ) : (
        <div className="flex items-center gap-3">
          <Progress value={percent(count, badge.palier)} aria-label={badge.name} className={cn("h-2 flex-1", PROGRESS_BAR)} />
          <span className="flex-none text-sm font-bold text-muted-foreground">
            {count} / {badge.palier}
          </span>
        </div>
      )}
    </li>
  );
}

function NextBadge({ count }: { count: number }) {
  const next = nextBadge(count);
  if (!next) {
    return <p className="m-0 rounded-step bg-cream p-5 font-bold text-ink">Tous les badges sont obtenus. Bravo !</p>;
  }
  return (
    <div className="rounded-step bg-cream p-5">
      <div className="flex items-center gap-3">
        <BadgeDisc palier={next.palier} earned={false} />
        <div>
          <div className="text-[13px] font-bold tracking-[.04em] text-muted-foreground uppercase">Prochain badge</div>
          <div className="font-display text-2xl leading-tight font-extrabold text-ink">{next.name}</div>
        </div>
      </div>
      <p className="mt-3 mb-3 text-muted-foreground">
        <strong className="text-coral-deep">{count}</strong> {count > 1 ? "comptes bloqués" : "compte bloqué"} sur{" "}
        {next.palier}, plus que {next.palier - count}.
      </p>
      <Progress value={percent(count, next.palier)} aria-label={`Progression vers ${next.name}`} className={cn("h-3", PROGRESS_BAR)} />
    </div>
  );
}

export function BadgesTab({ state }: { state: State }) {
  const { account, badges, blockCount } = state;
  if (!account) {
    return <Panel>Connectez-vous à x.com pour suivre vos badges.</Panel>;
  }
  return (
    <Panel>
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="text-2xl leading-tight">Mes badges</h2>
        <span className="text-muted-foreground">
          <strong className="text-ink">{earnedCount(badges)}</strong> sur {BADGES.length} obtenus
        </span>
      </div>
      <NextBadge count={blockCount} />
      <ul className="m-0 mt-5 grid list-none grid-cols-2 gap-4 p-0 max-[560px]:grid-cols-1">
        {BADGES.map((badge) => (
          <Tile key={badge.palier} badge={badge} count={blockCount} earned={hasBadge(badges, badge.palier)} />
        ))}
      </ul>
    </Panel>
  );
}
