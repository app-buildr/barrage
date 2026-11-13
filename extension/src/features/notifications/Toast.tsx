// Une notification : icône, « @nom » et titre, détail avec « Annuler », bouton
// « Fermer » et barre du temps restant. Un blocage dont le profil est connu
// montre en plus l'aperçu du compte, voir ProfilePreview.tsx.
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { clsx } from "clsx";
import { BarrageMark } from "../../ui/BarrageMark.tsx";
import { CORAL_BUTTON, CORAL_LINK } from "../../ui/classes.ts";
import { ProfileCard, profileLink } from "./ProfilePreview.tsx";
import { CloseButton, FOCUS, TOAST_CARD } from "./ToastParts.tsx";
import { LEAVE_MS, TOAST_MS, type ToastItem, type ToastStore } from "./toasts.ts";

/** Flèche de retour sur disque corail pâle. */
const UndoIcon = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true" className="block size-full">
    <circle cx="20" cy="20" r="19.5" className="fill-cream stroke-coral-soft" />
    <path
      d="M17 13l-4.5 4.5L17 22M12.5 17.5h9a5.5 5.5 0 0 1 0 11H19"
      className="fill-none stroke-coral-deep"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function Toast({ toast, store }: { toast: ToastItem; store: ToastStore }) {
  const { id, handle, content, revision, leaving } = toast;
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<HTMLSpanElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const countdown = useRef<Animation | null>(null);
  // Focus clavier dans la notification, lu avant que ce rendu ne touche à la
  // page. Un nouvel état peut retirer l'élément qui le porte : « Annuler » une
  // fois activé, ou la carte du profil quand la mise en page change.
  const hadKeyboardFocus = !!root.current?.querySelector(":focus-visible");
  const pausable = content.pausable !== false;

  // Décompte suspendu tant que la souris ou le focus clavier sont dessus, pas
  // de notification qui disparaît au moment de cliquer « Annuler ». Le focus
  // laissé par un clic de souris ne compte pas, sinon le décompte resterait figé.
  const holdsCountdown = useCallback(
    () =>
      pausable && !!root.current && (root.current.matches(":hover") || root.current.querySelector(":focus-visible") !== null),
    [pausable],
  );

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
  const restarted = useRef<number | null>(null);
  useLayoutEffect(() => {
    const animation = countdown.current;
    if (!animation || restarted.current === revision) return;
    restarted.current = revision;
    animation.effect?.updateTiming({ duration: content.duration ?? TOAST_MS });
    animation.currentTime = 0;
    if (holdsCountdown()) animation.pause();
    else animation.play();
    // Le focus clavier, perdu avec son élément, passe sur « Fermer » au lieu de
    // retomber sur la page.
    if (hadKeyboardFocus && !root.current?.querySelector(":focus-visible")) close.current?.focus();
  }, [revision, content.duration, holdsCountdown, hadKeyboardFocus]);

  // Sortie : retrait après l'animation, ou tout de suite si elle n'a pas lieu.
  useEffect(() => {
    if (!leaving) return;
    const fallback = setTimeout(() => store.remove(id), LEAVE_MS + 100);
    return () => clearTimeout(fallback);
  }, [leaving, id, store]);

  const resume = () => {
    if (!holdsCountdown()) countdown.current?.play();
  };

  /** « par Barrage · Annuler » : le détail, et le bouton si l'annulation est possible. */
  const detail = (
    <span className="text-label text-muted-ink">
      {content.detail}
      {content.undo ? (
        <>
          {" · "}
          <button type="button" className={clsx(CORAL_BUTTON, FOCUS)} onClick={() => content.undo?.()}>
            Annuler
          </button>
        </>
      ) : null}
    </span>
  );
  const closeButton = <CloseButton buttonRef={close} onClick={() => store.leave(id)} />;
  const profile = content.kind === "blocked" ? content.profile : undefined;

  return (
    <div
      ref={root}
      onMouseEnter={() => pausable && countdown.current?.pause()}
      onFocus={() => holdsCountdown() && countdown.current?.pause()}
      onMouseLeave={resume}
      onBlur={() => setTimeout(resume)}
      onTransitionEnd={() => leaving && store.remove(id)}
      style={{ transitionDuration: `${LEAVE_MS}ms` }}
      className={clsx(
        TOAST_CARD,
        "overflow-hidden text-[14px] leading-[1.35] text-ink",
        profile ? "flex flex-col gap-3 pt-3 pr-3 pb-4.5 pl-4" : "flex items-center gap-3.5 pt-3.5 pr-3.5 pb-4 pl-4",
        "[transition-property:opacity,transform] motion-reduce:[transition:none]",
        leaving && "opacity-0 [transform:translateX(16px)]",
      )}
    >
      {profile ? (
        // Maquette 06b : titre, carte du profil, puis « Annuler » et « Voir le profil ».
        <>
          <span className="flex items-center gap-2.5">
            <BarrageMark className="block size-6 flex-none" />
            <span className="min-w-0 flex-1 font-bold text-coral-deep">Vient d'être bloqué&nbsp;!&nbsp;✊</span>
            {closeButton}
          </span>
          <ProfileCard handle={handle} profile={profile} />
          <span className="flex items-center justify-between gap-3">
            {detail}
            {/* Même destination que la carte, pour la souris : un seul arrêt au clavier et au lecteur d'écran. */}
            <a {...profileLink(handle)} tabIndex={-1} aria-hidden="true" className={clsx(CORAL_LINK, "text-label")}>
              Voir le profil&nbsp;→
            </a>
          </span>
        </>
      ) : (
        // Maquette 06 : sans profil connu, après « Annuler », et pour un déblocage.
        <>
          <span className="block size-10 flex-none">
            {content.kind === "blocked" ? <BarrageMark className="block size-full" /> : <UndoIcon />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* Le titre tient sur une ligne : seul le nom est raccourci, jamais la fin de la phrase. */}
            <span className="flex min-w-0 text-[16px] font-bold text-ink">
              {/* Le nom ouvre le profil dans un nouvel onglet. */}
              <a
                {...profileLink(handle)}
                className={clsx(
                  "min-w-0 truncate font-bold text-coral-deep no-underline hover:underline hover:underline-offset-2",
                  FOCUS,
                )}
              >
                @{handle}
              </a>
              <span className="flex-none whitespace-pre">{content.title}</span>
            </span>
            {detail}
          </span>
          {closeButton}
        </>
      )}
      {/* Temps d'affichage restant : barre qui se vide vers la gauche, sur une piste pâle.
          Sans animation voulue, elle tourne quand même, invisible : elle donne le rythme. */}
      <span className="absolute inset-x-0 bottom-0 h-1 bg-line motion-reduce:opacity-0" />
      <span
        ref={timer}
        className={clsx(
          "absolute inset-x-0 bottom-0 z-1 h-1 origin-left motion-reduce:opacity-0",
          content.kind === "unblocked" ? "bg-disabled" : "bg-coral",
        )}
      />
    </div>
  );
}
