import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/ui/lib/utils";

/**
 * La fenêtre a perdu le focus (lien ouvert dans un nouvel onglet…) : à son
 * retour, le navigateur rend le focus au déclencheur, ce qui ouvrirait
 * l'infobulle sans que personne l'ait demandée. Une touche ou un survol lève l'interdit.
 */
function useRefocusGuard(): { suppressed: () => boolean; release: () => void } {
  const suppressed = React.useRef(false);
  React.useEffect(() => {
    const suppress = () => {
      suppressed.current = true;
    };
    const release = () => {
      suppressed.current = false;
    };
    window.addEventListener("blur", suppress);
    window.addEventListener("keydown", release, true);
    return () => {
      window.removeEventListener("blur", suppress);
      window.removeEventListener("keydown", release, true);
    };
  }, []);
  return {
    suppressed: () => suppressed.current,
    release: () => {
      suppressed.current = false;
    },
  };
}

/** Infobulle sombre, au survol comme au focus clavier. */
function Tooltip({
  label,
  children,
  className,
  side = "top",
}: {
  label: React.ReactNode;
  children: React.ReactElement;
  className?: string;
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"];
}) {
  const [open, setOpen] = React.useState(false);
  const guard = useRefocusGuard();
  return (
    <TooltipPrimitive.Provider delayDuration={150} skipDelayDuration={300}>
      <TooltipPrimitive.Root open={open} onOpenChange={(next) => setOpen(next && !guard.suppressed())}>
        <TooltipPrimitive.Trigger asChild onPointerMove={guard.release}>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            data-slot="tooltip"
            side={side}
            sideOffset={6}
            className={cn(
              "z-50 rounded-md bg-ink px-2.5 py-1.5 text-label font-semibold text-white shadow-[0_6px_20px_rgba(42,26,20,.25)] select-none",
              "animate-[tooltip-in_140ms_ease-out] motion-reduce:animate-none",
              className,
            )}
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-ink" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export { Tooltip };
