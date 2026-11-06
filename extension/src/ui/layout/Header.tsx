// En-tête des options et de l'accueil : logo, titre et, à droite, l'état de la connexion à x.com.
import type { ReactNode } from "react";

function Logo() {
  return (
    <svg className="size-16 flex-none rounded-full shadow-soft" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="24" className="fill-coral" />
      <rect x="12" y="20.25" width="24" height="7.5" rx="1.5" fill="#fff" />
    </svg>
  );
}

const DESCRIPTION =
  "Bloque automatiquement les comptes d'une liste collaborative et open source, depuis un onglet x.com connecté.";

type Props = { title?: string; description?: string; children?: ReactNode };

export function Header({ title = "Barrage", description = DESCRIPTION, children }: Props) {
  return (
    <header className="flex items-start gap-5 max-[560px]:flex-wrap">
      <Logo />
      <div className="min-w-0 flex-1">
        <h1 className="m-0 text-4xl leading-[1.1]">{title}</h1>
        <p className="mt-1.5 text-base text-muted-foreground">{description}</p>
      </div>
      {children}
    </header>
  );
}
