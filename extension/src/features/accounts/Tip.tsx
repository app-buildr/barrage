// Encart info de la liste X : affiché jusqu'à ce que l'utilisateur le ferme,
// fermeture mémorisée dans chrome.storage.local.
import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { Button } from "@/ui/components/button";

const DISMISSED_KEY = "tipDismissed";

export function Tip() {
  // Caché tant que le choix enregistré n'est pas lu, pour ne pas clignoter.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    void chrome.storage.local.get({ [DISMISSED_KEY]: false }).then((stored) => {
      setShown(stored[DISMISSED_KEY] !== true);
    });
  }, []);

  if (!shown) return null;
  return (
    <aside className="mb-5 flex items-center gap-3 rounded-step bg-sun-soft px-5 py-4 text-[15px] text-ink">
      <Info className="size-5 flex-none text-coral-deep" strokeWidth={2} aria-hidden="true" />
      <p className="m-0 flex-1">Les comptes que vous avez déjà bloqués sur X seront synchronisés avec Barrage.</p>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Fermer"
        className="-my-1.5 -mr-2 text-sun-soft-ink hover:bg-sun-soft-ink/10 hover:text-sun-soft-ink [&_svg:not([class*='size-'])]:size-[18px]"
        onClick={() => {
          setShown(false);
          void chrome.storage.local.set({ [DISMISSED_KEY]: true });
        }}
      >
        <X strokeWidth={2.2} />
      </Button>
    </aside>
  );
}
