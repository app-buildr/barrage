// Une notification : icône, « @nom » et titre, détail avec « Annuler », bouton
// « Fermer » et barre du temps restant.
import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/ui/lib/utils";
import { TOAST_MS, type ToastItem, type ToastStore } from "./toasts.ts";

/** Logo Barrage : disque corail barré de blanc. */
const BlockIcon = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true" className="block size-full">
    <circle cx="20" cy="20" r="20" fill="#F0643C" />
    <rect x="10" y="16.75" width="20" height="6.5" rx="1.5" fill="#fff" />
  </svg>
);

/** Flèche de retour sur disque corail pâle. */
const UndoIcon = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true" className="block size-full">
    <circle cx="20" cy="20" r="19.5" fill="#FFF6EE" stroke="#FDE3D8" />
    <path
      d="M17 13l-4.5 4.5L17 22M12.5 17.5h9a5.5 5.5 0 0 1 0 11H19"
      fill="none"
      stroke="#B83A14"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]">
    <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const FOCUS = "focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-deep";

export function Toast({ toast, store }: { toast: ToastItem; store: ToastStore }) {
  const { id, handle, content, revision, leaving } = toast;
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<HTMLSpanElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const countdown = useRef<Animation | null>(null);
  /** « Annuler » activé au clavier : le focus, perdu avec le bouton, passe sur « Fermer ». */
  const focusClose = useRef(false);
  const pausable = content.pausable !== false;

  // Décompte suspendu tant que la souris ou le focus clavier sont dessus, pas
  // de notification qui disparaît au moment de cliquer « Annuler ». Le focus
  // laissé par un clic de souris ne compte pas, sinon le décompte resterait figé.
  const hovered = () =>
    pausable && !!root.current && (root.current.matches(":hover") || root.current.querySelector(":focus-visible") !== null);

  // La barre donne le rythme : la notification part quand elle est vide.
  useLayoutEffect(() => {
    const animation = timer.current!.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
      duration: TOAST_MS,
      easing: "linear",
      fill: "forwards",
    });
    animation.onfinish = () => store.leave(id);
    countdown.current = animation;
    return () => animation.cancel();
  }, [id, store]);

  // Nouvel état : le décompte repart de zéro, à sa durée.
  useLayoutEffect(() => {
    const animation = countdown.current;
    if (!animation) return;
    animation.effect?.updateTiming({ duration: content.duration ?? TOAST_MS });
    animation.currentTime = 0;
    if (hovered()) animation.pause();
    else animation.play();
    if (focusClose.current) {
      focusClose.current = false;
      close.current?.focus();
    }
  }, [revision]);

  // Sortie : retrait après l'animation, ou tout de suite si elle n'a pas lieu.
  useEffect(() => {
    if (!leaving) return;
    const fallback = setTimeout(() => store.remove(id), 400);
    return () => clearTimeout(fallback);
  }, [leaving, id, store]);

  const resume = () => {
    if (!hovered()) countdown.current?.play();
  };

  return (
    <div
      ref={root}
      onMouseEnter={() => pausable && countdown.current?.pause()}
      onFocus={() => hovered() && countdown.current?.pause()}
      onMouseLeave={resume}
      onBlur={() => setTimeout(resume)}
      onTransitionEnd={() => leaving && store.remove(id)}
      className={cn(
        "pointer-events-auto relative box-border flex w-[440px] max-w-[calc(100vw-32px)] items-center gap-3.5 overflow-hidden",
        "rounded-[14px] border border-line bg-white pt-3.5 pr-3.5 pb-4 pl-4 text-left text-[14px] leading-[1.35] text-ink",
        "animate-toast-in [box-shadow:0_12px_32px_rgba(120,60,30,0.14)] [transition:opacity_.3s,transform_.3s]",
        "motion-reduce:animate-none motion-reduce:[transition:none]",
        leaving && "opacity-0 [transform:translateX(16px)]",
      )}
    >
      <span className="block size-10 flex-none">{content.kind === "blocked" ? <BlockIcon /> : <UndoIcon />}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-bold text-ink">
          {/* Le nom ouvre le profil dans un nouvel onglet. */}
          <a
            href={`https://x.com/${encodeURIComponent(handle)}`}
            target="_blank"
            rel="noopener"
            className={cn("font-bold text-coral-deep no-underline hover:underline hover:underline-offset-2", FOCUS)}
          >
            @{handle}
          </a>
          {content.title}
        </span>
        <span className="text-[13px] text-muted-ink">
          {content.detail}
          {content.undo ? (
            <>
              {" · "}
              <button
                type="button"
                className={cn(
                  "m-0 cursor-pointer border-0 bg-transparent p-0 font-bold text-coral-deep underline underline-offset-2 hover:text-coral-darker",
                  FOCUS,
                )}
                onClick={(event) => {
                  focusClose.current = event.currentTarget.matches(":focus-visible");
                  content.undo?.();
                }}
              >
                Annuler
              </button>
            </>
          ) : null}
        </span>
      </span>
      <button
        ref={close}
        type="button"
        aria-label="Fermer"
        onClick={() => store.leave(id)}
        className={cn(
          "m-0 grid size-8 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-muted-ink hover:bg-cream hover:text-ink",
          FOCUS,
        )}
      >
        <CloseIcon />
      </button>
      {/* Temps d'affichage restant : barre qui se vide vers la gauche, sur une piste pâle. */}
      <span className="absolute inset-x-0 bottom-0 h-1 bg-line" />
      <span
        ref={timer}
        className={cn(
          "absolute inset-x-0 bottom-0 z-1 h-1 origin-left",
          content.kind === "unblocked" ? "bg-disabled" : "bg-coral",
        )}
      />
    </div>
  );
}
