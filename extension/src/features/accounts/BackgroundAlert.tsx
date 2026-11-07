// Seule trace de l'activité de fond qui reste affichée, sur tous les onglets
// des options : une erreur qui empêche tout blocage, le temps qu'elle soit
// d'actualité, ou une limite imposée par X.
import { CircleAlert } from "lucide-react";
import { useSafeWrite } from "@/ui/use-safe-write.ts";
import { write } from "@/core/write.ts";
import { Button } from "@/ui/components/button.tsx";
import { Callout, StatusMessage } from "@/ui/layout/Section.tsx";
import { formatClock } from "@/core/intl.ts";
import type { BlockingError } from "@/core/state.ts";
import { errorText, errorTitle } from "../blocking/error-text.ts";
import { resumable } from "../blocking/plan.ts";

type Props = { error: BlockingError | null; pauseUntil: number };

export function BackgroundAlert({ error, pauseUntil }: Props) {
  const { error: writeError, attempt } = useSafeWrite();
  const now = Date.now();
  const shown = error !== null && now < error.staleAt ? error : null;
  const paused = pauseUntil > now;
  if (!shown && !paused) return null;

  const canResume = resumable(shown);
  const title = shown ? errorTitle(shown) : "X limite les blocages";
  const message = shown ? errorText(shown) : `Reprise vers ${formatClock(pauseUntil)}.`;
  return (
    <Callout
      role="alert"
      tone="alert"
      icon={CircleAlert}
      title={title}
      action={
        <div className="flex items-center gap-4">
          {canResume ? (
            <Button variant="outline" disabled={paused} onClick={() => void attempt(write("resumeBlocking"))}>
              Reprendre
            </Button>
          ) : null}
          <a href="https://x.com/home" target="_blank" rel="noopener" className="font-bold whitespace-nowrap text-coral-deep">
            Ouvrir x.com
          </a>
        </div>
      }
    >
      {message}
      {canResume ? (
        <>
          {" "}
          {paused
            ? `Vous pourrez reprendre à partir de ${formatClock(pauseUntil)}.`
            : "Vérifiez que votre compte fonctionne normalement sur x.com avant de reprendre."}
        </>
      ) : null}
      <StatusMessage kind="error" message={writeError} />
    </Callout>
  );
}
