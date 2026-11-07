// Onglet Badges des options, pour le compte X affiché.
import { Check } from "lucide-react";
import type { State } from "@/core/state.ts";
import { formatCount, percent, pluralWord } from "@/core/format.ts";
import { CORAL_LINK, OVERLINE, TO_REACH } from "@/ui/classes.ts";
import { Progress } from "@/ui/components/progress.tsx";
import { Panel } from "@/ui/layout/Section.tsx";
import { cn } from "@/ui/lib/utils.ts";
import { BADGES, badgeDescription, earnedCount, hasBadge, nextBadge, shareUrl, type Badge } from "./badges.ts";
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
      <p className="m-0 text-body text-muted-foreground">{badgeDescription(badge.palier)}</p>
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
          <Progress value={percent(count, badge.palier)} aria-label={`Progression vers ${badge.name}`} className="h-2 flex-1" />
          <span className="flex-none text-sm font-bold text-muted-foreground">
            {formatCount(count)} / {formatCount(badge.palier)}
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
          <div className={cn(OVERLINE, "text-label text-muted-foreground")}>Prochain badge</div>
          <div className="font-display text-2xl leading-tight font-extrabold text-ink">{next.name}</div>
        </div>
      </div>
      <p className="mt-3 mb-3 text-muted-foreground">
        <strong className="text-coral-deep">{formatCount(count)}</strong>{" "}
        {pluralWord(count, "compte bloqué", "comptes bloqués")} sur {formatCount(next.palier)}, plus que{" "}
        {formatCount(next.palier - count)}.
      </p>
      <Progress value={percent(count, next.palier)} aria-label={`Progression vers ${next.name}`} className="h-3" />
    </div>
  );
}

export function BadgesTab({ state }: { state: State }) {
  const { account, badges, blockCount } = state;
  const earned = earnedCount(badges);
  if (!account) {
    return <Panel>Connectez-vous à x.com pour suivre vos badges.</Panel>;
  }
  return (
    <Panel>
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2>Mes badges</h2>
        <span className="text-muted-foreground">
          <strong className="text-ink">{earned}</strong> sur {BADGES.length} {pluralWord(earned, "obtenu")}
        </span>
      </div>
      <NextBadge count={blockCount} />
      <ul className="m-0 mt-5 grid list-none grid-cols-2 gap-4 p-0 max-xs:grid-cols-1">
        {BADGES.map((badge) => (
          <Tile key={badge.palier} badge={badge} count={blockCount} earned={hasBadge(badges, badge.palier)} />
        ))}
      </ul>
    </Panel>
  );
}
