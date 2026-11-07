// Éléments communs aux notifications de blocage et de badge.
import type { Ref } from "react";
// clsx plutôt que le cn de ui/lib/utils, ici et dans les autres composants du
// content script : aucune classe en conflit, et tailwind-merge l'alourdirait.
import { clsx } from "clsx";

export const FOCUS =
  "focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-deep";

/** Socle d'une notification, à compléter par sa mise en page. */
export const TOAST_CARD =
  "pointer-events-auto relative box-border w-[440px] max-w-[calc(100vw-32px)] rounded-card border border-line bg-white text-left shadow-toast animate-toast-in motion-reduce:animate-none";

type Props = { onClick: () => void; buttonRef?: Ref<HTMLButtonElement>; className?: string };

export function CloseButton({ onClick, buttonRef, className }: Props) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label="Fermer"
      onClick={onClick}
      className={clsx(
        "m-0 grid size-8 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-muted-ink hover:bg-cream hover:text-ink",
        FOCUS,
        className,
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]">
        <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
