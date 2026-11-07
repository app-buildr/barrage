// Pastille d'en-tête des options : un onglet x.com est prêt à bloquer, ou ce qu'il
// reste à faire pour cela. Le blocage ne fonctionne que depuis un onglet connecté.
import { Badge } from "@/ui/components/badge.tsx";
import { cn } from "@/ui/lib/utils.ts";
import { X_HOME_URL } from "../networks/networks.ts";
import type { XTabStatus } from "./x-tab.ts";

const PILL = "gap-[7px] px-3 py-1 text-label font-bold before:size-[7px] before:rounded-full before:bg-current before:content-['']";

const TO_DO: Record<Exclude<XTabStatus, "connected">, { label: string; title: string }> = {
  none: { label: "Ouvrez x.com", title: "Barrage bloque depuis un onglet x.com : aucun n'est ouvert." },
  logged_out: { label: "Connectez-vous à x.com", title: "Barrage bloque depuis un onglet x.com connecté à votre compte." },
};

/** @param status null le temps de la première vérification */
export function ConnectionBadge({ status }: { status: XTabStatus | null }) {
  return (
    <span role="status" className="flex-none">
      {status === "none" || status === "logged_out" ? (
        <Badge asChild variant="outline" className={cn(PILL, "bg-card")}>
          <a href={X_HOME_URL} target="_blank" rel="noopener" title={TO_DO[status].title}>
            {TO_DO[status].label}
          </a>
        </Badge>
      ) : (
        <Badge
          variant="connected"
          className={cn(PILL, status === null && "invisible")}
          title={status ? "Un onglet x.com connecté est ouvert : Barrage peut bloquer." : undefined}
        >
          {status ? "x.com connecté" : ""}
        </Badge>
      )}
    </span>
  );
}
