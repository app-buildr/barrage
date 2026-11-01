// Seule trace de l'activité de fond qui reste affichée : une erreur qui
// empêche tout blocage, le temps qu'elle soit d'actualité.
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/ui/components/alert";
import { cn } from "@/ui/lib/utils";
import type { BlockingError, ErrorReason } from "@/core/state.ts";

const TITLES: Record<ErrorReason, string> = {
  auth: "Session X expirée",
  network: "Réseau indisponible",
  other: "Blocage interrompu",
};

export function BackgroundAlert({ error }: { error: BlockingError | null }) {
  if (error === null || Date.now() >= error.staleAt) return null;
  return (
    <Alert
      className={cn(
        "mb-5 grid-cols-[20px_1fr_auto] gap-x-3 rounded-step border-line px-5 py-4 text-base shadow-soft",
        "has-[>svg]:grid-cols-[20px_1fr_auto] [&>svg]:row-span-2 [&>svg]:size-5 [&>svg]:text-state-problem",
      )}
    >
      <CircleAlert strokeWidth={2.2} aria-hidden="true" />
      <AlertTitle className="line-clamp-none text-base font-bold text-state-problem">{TITLES[error.reason]}</AlertTitle>
      <AlertDescription className="text-base text-ink">{error.message}</AlertDescription>
      <a
        href="https://x.com/home"
        target="_blank"
        rel="noopener"
        className="col-start-3 row-span-2 row-start-1 self-center font-bold whitespace-nowrap text-coral-deep"
      >
        Ouvrir x.com
      </a>
    </Alert>
  );
}
