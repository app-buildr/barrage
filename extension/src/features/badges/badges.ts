// Badges de progression : paliers, attribution et partage. Fonctions pures,
// testées dans tests/badges.test.ts.
import { SITE_URL, X_ACCOUNT } from "../../core/config.ts";
import { formatCount, plural } from "../../core/format.ts";
import { xShareUrl } from "../networks/networks.ts";

/**
 * `emoji` : celui du texte de partage. `slug` : adresse de la page du badge sur
 * le site, celle que X lit pour la carte du tweet (docs/badge/<slug>/, générée
 * par scripts/make-badge-pages.mjs). Elle ne change pas avec le nom : un tweet
 * déjà publié garde sa carte.
 */
export const BADGES = [
  { palier: 1, name: "Première pierre", emoji: "🪨", slug: "premiere-pierre" },
  { palier: 10, name: "Premier rempart", emoji: "🛡️", slug: "premier-rempart" },
  { palier: 25, name: "Digue", emoji: "🌊", slug: "digue" },
  { palier: 50, name: "Muraille", emoji: "🧱", slug: "muraille" },
  { palier: 100, name: "Barrage", emoji: "✊", slug: "barrage" },
  { palier: 250, name: "Forteresse", emoji: "🏰", slug: "forteresse" },
  { palier: 500, name: "Bastion", emoji: "🚩", slug: "bastion" },
  { palier: 1000, name: "Légende", emoji: "🏆", slug: "legende" },
] as const satisfies ReadonlyArray<{ palier: number; name: string; emoji: string; slug: string }>;

export type Badge = (typeof BADGES)[number];

export type Palier = Badge["palier"];

/** Ce que récompense un badge, d'après son palier. */
export const badgeDescription = (palier: Palier): string =>
  palier === 1 ? "Votre premier compte bloqué" : plural(palier, "compte bloqué", "comptes bloqués");

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

/** Page du badge sur le site : son image est la carte du tweet de partage. */
export const badgePageUrl = (badge: Badge): string => `${SITE_URL}/badge/${badge.slug}/`;

/** Texte du tweet de partage : un seul lien, celui de la page du badge, dont X tire la carte. */
export function shareText(badge: Badge): string {
  const signature = `Vos réseaux sociaux, vos règles. ${badgePageUrl(badge)}`;
  if (badge.palier === 1) return `J'ai bloqué mon premier compte avec ${X_ACCOUNT} ${badge.emoji} ${signature}`;
  return `J'ai débloqué le badge ${badge.name} ${badge.emoji} : ${formatCount(badge.palier)} comptes bloqués avec ${X_ACCOUNT}. ${signature}`;
}

export const shareUrl = (badge: Badge): string => xShareUrl(shareText(badge));

/** Palier suivant dans la notification d'un badge obtenu. */
export function nextStepText(palier: number): string {
  const next = nextBadge(palier);
  return next ? `Prochain palier : ${next.name}, à ${formatCount(next.palier)}.` : "Vous avez atteint le dernier palier.";
}
