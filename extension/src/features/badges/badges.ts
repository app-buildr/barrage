// Badges de progression : paliers, attribution et partage. Fonctions pures,
// testées dans tests/badges.test.ts.
import { SITE_URL, X_ACCOUNT } from "../../core/config.ts";

export type Badge = {
  palier: number;
  name: string;
  /** Emoji du texte de partage. */
  emoji: string;
  description: string;
};

export const BADGES: readonly Badge[] = [
  { palier: 1, name: "Première pierre", emoji: "🪨", description: "Votre premier compte bloqué" },
  { palier: 10, name: "Premier rempart", emoji: "🛡️", description: "10 comptes bloqués" },
  { palier: 25, name: "Digue", emoji: "🌊", description: "25 comptes bloqués" },
  { palier: 50, name: "Muraille", emoji: "🧱", description: "50 comptes bloqués" },
  { palier: 100, name: "Barrage", emoji: "✊", description: "100 comptes bloqués" },
  { palier: 250, name: "Forteresse", emoji: "🏰", description: "250 comptes bloqués" },
  { palier: 500, name: "Bastion", emoji: "🚩", description: "500 comptes bloqués" },
  { palier: 1000, name: "Légende", emoji: "🏆", description: "1000 comptes bloqués" },
];

/** Badges obtenus : palier, date d'obtention en millisecondes. */
export type Earned = Record<string, number>;

export const hasBadge = (earned: Earned, palier: number): boolean => Object.hasOwn(earned, String(palier));

export const badgeOf = (palier: number): Badge | undefined => BADGES.find((b) => b.palier === palier);

/** Prochain palier après celui-ci, ou après le compteur donné. */
export const nextBadge = (count: number): Badge | undefined => BADGES.find((b) => b.palier > count);

export const earnedCount = (earned: Earned): number => BADGES.filter((b) => hasBadge(earned, b.palier)).length;

/** Inscrit les paliers atteints par `count` et pas encore obtenus. */
export function awardBadges(count: number, earned: Earned, now: number): Earned {
  const badges: Earned = { ...earned };
  for (const { palier } of BADGES) {
    if (palier <= count && !hasBadge(earned, palier)) badges[palier] = now;
  }
  return badges;
}

/**
 * Badge à notifier : le plus haut obtenu, s'il ne l'a pas encore été. Les
 * paliers inférieurs ne le sont jamais, même franchis sans notification.
 */
export function pendingBadge(earned: Earned, notified: number): number | null {
  const highest = BADGES.filter((b) => hasBadge(earned, b.palier)).at(-1)?.palier;
  return highest !== undefined && highest > notified ? highest : null;
}

/** Texte du tweet de partage. */
export function shareText(badge: Badge): string {
  const signature = `Vos réseaux sociaux, vos règles. ${SITE_URL.replace("https://", "")}`;
  if (badge.palier === 1) return `J'ai bloqué mon premier compte avec ${X_ACCOUNT} ${badge.emoji} ${signature}`;
  return `J'ai débloqué le badge ${badge.name} ${badge.emoji} : ${badge.palier} comptes bloqués avec ${X_ACCOUNT}. ${signature}`;
}

export const shareUrl = (badge: Badge): string => `https://x.com/intent/post?text=${encodeURIComponent(shareText(badge))}`;

/** Palier suivant dans la notification d'un badge obtenu. */
export function nextStepText(palier: number): string {
  const next = nextBadge(palier);
  return next ? `Prochain palier : ${next.name}, à ${next.palier}.` : "Vous avez atteint le dernier palier.";
}
