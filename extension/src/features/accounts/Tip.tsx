// Encart info de la liste X : affiché jusqu'à ce que l'utilisateur le ferme.
import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { Button } from "@/ui/components/button.tsx";
import { Callout } from "@/ui/layout/Section.tsx";
import { dismissTip, tipDismissed } from "./tip.ts";

export function Tip() {
  // Caché tant que le choix enregistré n'est pas lu, pour ne pas clignoter.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    void tipDismissed().then((dismissed) => setShown(!dismissed));
  }, []);

  if (!shown) return null;
  return (
    <Callout
      icon={Info}
      className="mb-5"
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fermer"
          className="-my-1.5 -mr-2 text-sun-soft-ink hover:bg-sun-soft-ink/10 hover:text-sun-soft-ink [&_svg:not([class*='size-'])]:size-[18px]"
          onClick={() => {
            setShown(false);
            void dismissTip();
          }}
        >
          <X strokeWidth={2.2} />
        </Button>
      }
    >
      Les comptes que vous avez déjà bloqués sur X seront synchronisés avec Barrage.
    </Callout>
  );
}
