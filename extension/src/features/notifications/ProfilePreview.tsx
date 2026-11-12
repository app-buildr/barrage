// Aperçu du compte bloqué dans la notification : avatar, nom, pastille
// certifiée, @nom, abonnés et début de la bio. Voir la maquette 06b.
import { useState } from "react";
import { clsx } from "clsx";
import { compactCount, pluralWord } from "../../core/format.ts";
import { xProfileUrl } from "../networks/networks.ts";
import { avatarUrl, initials, type Profile } from "../profiles/profile.ts";

/** Focus de la carte : contour qui suit son rayon, contrairement à FOCUS. */
const CARD_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-deep";

/**
 * Contour de rosette : un cercle festonné, `lobes` arcs vers l'extérieur.
 * Calculé une fois, pour un viewBox de 24.
 */
function rosettePath(lobes = 8, inner = 9.6, outer = 12.4): string {
  const point = (radius: number, angle: number) =>
    `${(12 + radius * Math.cos(angle)).toFixed(2)} ${(12 + radius * Math.sin(angle)).toFixed(2)}`;
  const step = (2 * Math.PI) / lobes;
  let d = `M${point(inner, 0)}`;
  for (let i = 0; i < lobes; i++) d += `Q${point(outer, (i + 0.5) * step)} ${point(inner, (i + 1) * step)}`;
  return `${d}Z`;
}

const ROSETTE = rosettePath();

/** Pastille certifiée, dessinée ici : une seule, bleue, quelle que soit celle de X. */
function VerifiedBadge() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Compte certifié" className="block size-[18px] flex-none">
      <path d={ROSETTE} fill="#1D9BF0" />
      <path
        d="M7.6 12.3l3 3 5.8-6.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Avatar rond, ou les initiales du nom s'il n'y en a pas ou s'il ne charge pas. */
function Avatar({ profile }: { profile: Profile }) {
  const [failed, setFailed] = useState(false);
  const base = "size-12 flex-none rounded-full";
  if (profile.avatar && !failed) {
    // 73 px affichés en 48 : net sur un écran haute densité.
    return <img src={avatarUrl(profile.avatar, "bigger")} alt="" onError={() => setFailed(true)} className={clsx(base, "block object-cover bg-line-strong")} />;
  }
  return (
    <span aria-hidden="true" className={clsx(base, "grid place-items-center bg-line-strong text-[18px] font-bold text-muted-ink")}>
      {initials(profile)}
    </span>
  );
}

/** Carte du profil, entièrement cliquable vers le profil, dans un nouvel onglet. */
export function ProfileCard({ handle, profile }: { handle: string; profile: Profile }) {
  return (
    <a
      href={xProfileUrl(handle)}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        "block rounded-step border border-line bg-cream p-3 text-muted-ink no-underline hover:border-line-strong",
        CARD_FOCUS,
      )}
    >
      <span className="flex items-center gap-3">
        <Avatar profile={profile} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[16px] leading-tight font-bold text-ink">{profile.name}</span>
            {profile.verified ? <VerifiedBadge /> : null}
          </span>
          <span className="truncate text-[14px]">
            <span className="font-semibold text-coral-deep">@{profile.screenName}</span>
            {profile.followers !== null ? (
              <>
                {" · "}
                <strong className="text-ink">{compactCount(profile.followers)}</strong> {pluralWord(profile.followers, "abonné")}
              </>
            ) : null}
          </span>
        </span>
      </span>
      {profile.bio ? <span className="mt-2.5 line-clamp-2 text-[14px] leading-[1.4] break-words">{profile.bio}</span> : null}
    </a>
  );
}
