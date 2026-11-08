// Rond d'un badge, partagé par les options et la notification sur x.com.
import { clsx } from "clsx";
import { TO_REACH } from "../../ui/classes.ts";
import type { Palier } from "./badges.ts";
import { badgeIcon } from "./icons.ts";

type Props = { palier: Palier; earned: boolean; iconSize?: number };

export function BadgeDisc({ palier, earned, iconSize = 24 }: Props) {
  return (
    <span
      className={clsx(
        "box-border grid size-12 flex-none place-items-center rounded-full",
        earned ? "bg-coral text-white" : TO_REACH,
      )}
    >
      {badgeIcon(palier, iconSize)}
    </span>
  );
}
