// En-tête des options et de l'accueil : logo, titre et, à droite, l'état de la connexion à x.com.
import type { ReactNode, Ref } from "react";
import { BarrageMark } from "@/ui/BarrageMark.tsx";

const DESCRIPTION =
  "Bloque automatiquement les comptes d'une liste collaborative et open source, depuis un onglet x.com connecté.";

/** `titleRef` : le titre peut recevoir le focus, sans contour, quand le contenu change d'un bloc. */
type Props = { title?: string; description?: string; titleRef?: Ref<HTMLHeadingElement>; children?: ReactNode };

export function Header({ title = "Barrage", description = DESCRIPTION, titleRef, children }: Props) {
  return (
    <header className="flex items-start gap-5 max-xs:flex-wrap">
      <BarrageMark className="size-16 flex-none rounded-full shadow-soft" />
      <div className="min-w-0 flex-1">
        <h1 ref={titleRef} tabIndex={-1} className="m-0 text-4xl leading-[1.1] outline-none">
          {title}
        </h1>
        <p className="mt-1.5 text-base text-muted-foreground">{description}</p>
      </div>
      {children}
    </header>
  );
}
