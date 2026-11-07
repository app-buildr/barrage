// Pastille d'en-tête des options, affichée quand un onglet x.com est prêt à
// bloquer, c'est-à-dire ouvert et connecté à X.
import { Badge } from "@/ui/components/badge.tsx";
import { cn } from "@/ui/lib/utils.ts";
import { useXConnection } from "./use-connection.ts";

export function ConnectionBadge() {
  const connected = useXConnection();
  return (
    <span role="status" className="flex-none">
      <Badge
        className={cn(
          "gap-[7px] bg-coral-soft px-3 py-1 text-label font-bold text-coral-deep",
          "before:size-[7px] before:rounded-full before:bg-current before:content-['']",
          !connected && "invisible",
        )}
        title={connected ? "Un onglet x.com connecté est ouvert : Barrage peut bloquer." : undefined}
      >
        {connected ? "x.com connecté" : ""}
      </Badge>
    </span>
  );
}
