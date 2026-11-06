// Classes partagées par la page d'options et les notifications de x.com
// (déclaré en @source dans features/notifications/toast.css).

/** Lien ou bouton texte corail. */
export const CORAL_LINK = "font-bold text-coral-deep underline underline-offset-2 hover:text-coral-darker";

/** Pastille corail pâle : Officielle, Recommandée. */
export const CORAL_PILL = "bg-coral-soft px-2.5 py-0.5 text-sm font-bold text-coral-deep";

/** Rond d'un badge encore à atteindre. */
export const TO_REACH = "border border-dashed border-line-strong bg-cream-2 text-disabled";

/** Barre de progression du thème, à compléter par sa hauteur. */
export const PROGRESS_BAR =
  "bg-line [&>[data-slot=progress-indicator]]:rounded-full [&>[data-slot=progress-indicator]]:bg-coral";

/** Grand champ en pilule, à compléter par son fond. */
export const PILL_INPUT =
  "h-[52px] min-w-0 flex-1 rounded-full border-line-strong px-5 text-base shadow-none md:text-base focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-coral-deep";
