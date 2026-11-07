// Notification de nouveau badge : sans décompte, elle reste jusqu'à ce qu'elle
// soit fermée ou partagée.
// clsx plutôt que cn : aucune classe en conflit ici, et tailwind-merge alourdirait le content script.
import { clsx as cn } from "clsx";
import { plural } from "../../core/format.ts";
import { CORAL_LINK } from "../../ui/classes.ts";
import { badgeOf, nextStepText, shareUrl } from "../badges/badges.ts";
import { BadgeDisc } from "../badges/BadgeDisc.tsx";
import { CloseButton, FOCUS, TOAST_CARD } from "./ToastParts.tsx";

type Props = { palier: number; onDismiss: (palier: number) => void; onOpenBadges: () => void };

export function BadgeToast({ palier, onDismiss, onOpenBadges }: Props) {
  const badge = badgeOf(palier);
  if (!badge) return null;
  return (
    <div className={cn(TOAST_CARD, "p-4 text-[15px] leading-[1.45] text-muted-ink")}>
      <div className="flex items-center gap-3 pr-8">
        <BadgeDisc palier={badge.palier} earned iconSize={26} />
        <div className="min-w-0">
          <div className="text-[13px] font-bold tracking-[.04em] text-coral-deep uppercase">Nouveau badge</div>
          <div className="truncate text-[21px] leading-tight font-extrabold text-ink">
            {badge.name}&nbsp;!&nbsp;✊
          </div>
        </div>
      </div>
      <p className="mt-3 mb-0">
        Vous avez bloqué <strong className="text-ink">{plural(palier, "compte")}</strong>. {nextStepText(palier)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={shareUrl(badge)}
          target="_blank"
          rel="noopener"
          onClick={() => onDismiss(palier)}
          className={cn("inline-flex h-11 items-center rounded-full bg-coral-deep px-5 font-bold text-white no-underline hover:bg-coral-darker", FOCUS)}
        >
          Partager sur X&nbsp;→
        </a>
        <button
          type="button"
          onClick={onOpenBadges}
          className={cn("m-0 cursor-pointer border-0 bg-transparent p-0", CORAL_LINK, FOCUS)}
        >
          Voir mes badges
        </button>
      </div>
      <CloseButton onClick={() => onDismiss(palier)} className="absolute top-2.5 right-2.5" />
    </div>
  );
}
