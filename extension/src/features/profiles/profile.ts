// Profil d'un compte bloqué : nom affiché, avatar et bio, pour que la
// notification de blocage dise qui c'est sans ouvrir son profil. Aucune
// requête de plus : X renvoie le compte entier en réponse au blocage, voir
// blockUser. Seuls les comptes bloqués par Barrage ont donc un profil.
//
// Fonctions pures, testées dans tests/profile.test.ts. Le stockage est dans
// store.ts.
import { isRecord } from "../../core/state.ts";

export type Profile = {
  /** Nom affiché, « Jean Dupont ». */
  name: string;
  /** Identifiant avec sa casse, « JeanDupont » : les clés de Barrage sont en minuscules. */
  screenName: string;
  /** Avatar en 48 px, voir avatarUrl pour une autre taille. Null : avatar par défaut de X. */
  avatar: string | null;
  /** Bio en texte brut, liens t.co remplacés par leur adresse lisible. Vide si aucune. */
  bio: string;
  /** Nombre d'abonnés, ou null s'il manque. */
  followers: number | null;
  /** Compte certifié, quelle que soit la couleur du badge sur X. */
  verified: boolean;
};

/**
 * Seules les images de X sont affichées : une adresse venue d'ailleurs ne
 * part pas, dans la page de x.com, vers un serveur inconnu.
 */
const AVATAR_RE = /^https:\/\/(?:pbs|abs)\.twimg\.com\/[^\s"'<>]+$/;
/** Avatar par défaut de X : une silhouette, autant dessiner la nôtre. */
const DEFAULT_AVATAR_RE = /\/default_profile_images\//;

/** Avatar à afficher, ou null : absent, par défaut, ou hors des serveurs de X. */
const avatarOf = (value: unknown): string | null =>
  typeof value === "string" && AVATAR_RE.test(value) && !DEFAULT_AVATAR_RE.test(value) ? value : null;

/** Tailles servies par X pour un avatar, par le suffixe de son nom de fichier. */
export type AvatarSize = "normal" | "bigger" | "200x200" | "400x400";

/** Avatar `normal` (48 px) en une autre taille : `bigger` 73 px, `200x200`, `400x400`. */
export const avatarUrl = (avatar: string, size: AvatarSize): string =>
  avatar.replace(/_normal(\.[a-z]+)?$/i, `_${size}$1`);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const countOf = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** L'API v1.1 échappe ces trois caractères dans les textes, comme pour du HTML. */
const unescape = (value: string): string =>
  value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

/**
 * Bio lisible : chaque lien t.co remplacé par l'adresse que X affiche,
 * « exemple.fr/page ». Décodée avant : les adresses, elles, ne sont pas échappées.
 */
function readBio(user: Record<string, unknown>): string {
  let bio = unescape(text(user.description));
  const entities = isRecord(user.entities) && isRecord(user.entities.description) ? user.entities.description : null;
  const urls = Array.isArray(entities?.urls) ? entities.urls : [];
  for (const entry of urls) {
    if (!isRecord(entry)) continue;
    const short = text(entry.url);
    const shown = text(entry.display_url) || text(entry.expanded_url);
    // Une fonction : un « $& » dans l'adresse resterait sinon un motif de remplacement.
    if (short && shown) bio = bio.replaceAll(short, () => shown);
  }
  return bio;
}

/**
 * Profil du compte renvoyé par X après un blocage, ou null s'il ne correspond
 * pas au compte visé : une réponse imprévue ne doit pas prêter à l'un le
 * visage d'un autre.
 */
export function readProfile(body: unknown, handle: string): Profile | null {
  if (!isRecord(body)) return null;
  const screenName = text(body.screen_name);
  if (screenName.toLowerCase() !== handle) return null;
  const avatar = body.default_profile_image === true ? null : avatarOf(text(body.profile_image_url_https));
  return {
    name: unescape(text(body.name)) || screenName,
    screenName,
    avatar,
    bio: readBio(body),
    followers: countOf(body.followers_count),
    // Badge historique ou abonnement : X affiche l'un comme l'autre.
    verified: body.verified === true || body.is_blue_verified === true,
  };
}

/** Profil stocké, ou null s'il est absent ou mal formé. Son avatar passe les mêmes contrôles. */
export function storedProfile(value: unknown): Profile | null {
  if (!isRecord(value)) return null;
  const { name, screenName, avatar, bio, followers, verified } = value;
  if (typeof name !== "string" || typeof screenName !== "string" || typeof bio !== "string") return null;
  return { name, screenName, bio, avatar: avatarOf(avatar), followers: countOf(followers), verified: verified === true };
}

/** Une lettre ou un chiffre en tête de mot. */
const INITIAL_RE = /[\p{L}\p{N}]/u;

/**
 * Initiales à la place d'un avatar absent : celles des deux premiers mots du
 * nom qui en ont, « Compte Exemple » → « CE ». L'identifiant sert si le nom
 * n'est fait que d'emoji ou de symboles.
 */
export function initials(profile: Pick<Profile, "name" | "screenName">): string {
  const letters = profile.name
    .split(/\s+/)
    .map((word) => INITIAL_RE.exec(word)?.[0])
    .filter((letter) => letter !== undefined);
  const chosen = letters.length ? letters.slice(0, 2) : [INITIAL_RE.exec(profile.screenName)?.[0] ?? "?"];
  return chosen.join("").toLocaleUpperCase("fr-FR");
}
