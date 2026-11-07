// Réseaux sociaux affichés en onglets dans les options. X est le seul pris en
// charge aujourd'hui ; les autres sont listés pour préparer leur arrivée.
// Une entrée suffit pour un onglet grisé « Bientôt ». L'état et le blocage restent
// propres à X : `available` ne peut passer à vrai pour un autre réseau qu'avec un
// moteur de blocage et un état par réseau, voir ENGINE_NETWORK.

/** Origines de X, dans l'ordre : la première est celle des liens. */
export const X_ORIGINS = ["https://x.com", "https://twitter.com"] as const;

/** Motifs d'hôtes de X, ceux du manifest : `npm run check` refuse un écart. */
export const X_MATCHES: string[] = X_ORIGINS.map((origin) => `${origin}/*`);

export const X_HOME_URL = `${X_ORIGINS[0]}/home`;

export const xProfileUrl = (handle: string): string => `${X_ORIGINS[0]}/${encodeURIComponent(handle)}`;

/** Page de X qui prépare un post avec ce texte. */
export const xShareUrl = (text: string): string => `${X_ORIGINS[0]}/intent/post?text=${encodeURIComponent(text)}`;

export type NetworkId = "x" | "instagram" | "tiktok" | "youtube" | "facebook";

export type Network = {
  id: NetworkId;
  label: string;
  profileUrl: (handle: string) => string;
  /** Libellé d'un compte dans la liste, « @nom » par défaut. */
  display?: (handle: string) => string;
  /**
   * Onglet ouvrable. Faux : onglet grisé « Bientôt », sans panneau consultable.
   */
  available: boolean;
};

export const NETWORKS: readonly Network[] = [
  { id: "x", label: "X", profileUrl: xProfileUrl, available: true },
  {
    id: "instagram",
    label: "Instagram",
    profileUrl: (h) => `https://www.instagram.com/${h}/`,
    available: false,
  },
  {
    id: "tiktok",
    label: "TikTok",
    profileUrl: (h) => `https://www.tiktok.com/@${h}`,
    available: false,
  },
  {
    id: "youtube",
    label: "YouTube",
    // Identifiant de chaîne « UC… » ou « @nom », voir ENTRY_RULES dans scripts/check-repo.mjs.
    profileUrl: (h) => (h.startsWith("@") ? `https://www.youtube.com/${h}` : `https://www.youtube.com/channel/${h}`),
    display: (h) => h,
    available: false,
  },
  {
    id: "facebook",
    label: "Facebook",
    profileUrl: (h) => `https://www.facebook.com/${h}`,
    display: (h) => h,
    available: false,
  },
];

/** Réseaux ouvrables, ceux que peut viser une liste. */
export const AVAILABLE_NETWORKS: readonly Network[] = NETWORKS.filter((n) => n.available);

/** Seul réseau doté d'un moteur de blocage : les comptes des options sont les siens. */
export const ENGINE_NETWORK: NetworkId = "x";

export function toNetworkId(value: unknown): NetworkId {
  return NETWORKS.some((n) => n.id === value) ? (value as NetworkId) : "x";
}
