// Seule trace de l'activité de fond qui reste affichée, sur tous les onglets
// des options : une erreur qui empêche tout blocage, le temps qu'elle soit
// d'actualité, ou une limite imposée par X.
import { CircleAlert } from "lucide-react";
import { useSafeWrite } from "@/ui/use-safe-write.ts";
import { write } from "@/core/write.ts";
import { Alert, AlertDescription, AlertTitle } from "@/ui/components/alert.tsx";
import { Button } from "@/ui/components/button.tsx";
import { StatusMessage } from "@/ui/layout/Section.tsx";
import { cn } from "@/ui/lib/utils.ts";
import type { BlockingError, ErrorReason } from "@/core/state.ts";
import { resumable } from "../blocking/plan.ts";

const TITLES: Record<ErrorReason, string> = {
  auth: "Session X expirée",
  network: "Réseau indisponible",
  automation: "Blocage arrêté par prudence",
  api: "Blocage arrêté",
  other: "Blocage interrompu",
};

const TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const DAY_TIME = new Intl.DateTimeFormat("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" });

/** « 14:32 », avec le jour si ce n'est pas aujourd'hui. */
function clock(at: number): string {
  return (new Date(at).toDateString() === new Date().toDateString() ? TIME : DAY_TIME).format(at);
}

type Props = { error: BlockingError | null; pauseUntil: number };

export function BackgroundAlert({ error, pauseUntil }: Props) {
  const { error: writeError, attempt } = useSafeWrite();
  const now = Date.now();
  const shown = error !== null && now < error.staleAt ? error : null;
  const paused = pauseUntil > now;
  if (!shown && !paused) return null;

  const canResume = resumable(shown);
  const title = shown ? TITLES[shown.reason] : "X limite les blocages";
  const message = shown?.message ?? `Reprise vers ${clock(pauseUntil)}.`;
  return (
    <Alert
      className={cn(
        "grid-cols-[20px_1fr_auto] gap-x-3 rounded-step border-line px-5 py-4 text-base shadow-soft",
        "has-[>svg]:grid-cols-[20px_1fr_auto] [&>svg]:row-span-2 [&>svg]:size-5 [&>svg]:text-state-problem",
      )}
    >
      <CircleAlert strokeWidth={2.2} aria-hidden="true" />
      <AlertTitle className="line-clamp-none text-base font-bold text-state-problem">{title}</AlertTitle>
      <AlertDescription className="text-base text-ink">
        {message}
        {canResume ? (
          <>
            {" "}
            {paused
              ? `Vous pourrez reprendre à partir de ${clock(pauseUntil)}.`
              : "Vérifiez que votre compte fonctionne normalement sur x.com avant de reprendre."}
          </>
        ) : null}
        <StatusMessage kind="error" message={writeError} />
      </AlertDescription>
      <div className="col-start-3 row-span-2 row-start-1 flex items-center gap-4 self-center">
        {canResume ? (
          <Button variant="outline" disabled={paused} onClick={() => void attempt(write("resumeBlocking"))}>
            Reprendre
          </Button>
        ) : null}
        <a href="https://x.com/home" target="_blank" rel="noopener" className="font-bold whitespace-nowrap text-coral-deep">
          Ouvrir x.com
        </a>
      </div>
    </Alert>
  );
}
