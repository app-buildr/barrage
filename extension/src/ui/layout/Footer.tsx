// Pied de la page d'options : demande de retrait de la liste, liens vers le dépôt.
const LINKS = [
  {
    href: "mailto:barrage.app@protonmail.com?subject=Demande%20de%20retrait%20de%20la%20liste",
    label: "Demander un retrait de la liste",
  },
  { href: "https://github.com/app-buildr/barrage", label: "Code source et liste sur GitHub", external: true },
  {
    href: "https://github.com/app-buildr/barrage/issues/new?labels=bug",
    label: "Signaler un bogue",
    external: true,
  },
];

export function Footer() {
  return (
    <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-[15px]">
      {LINKS.map(({ href, label, external }) => (
        <a
          key={href}
          href={href}
          className="inline-flex min-h-11 items-center text-muted-foreground hover:text-ink"
          {...(external ? { target: "_blank", rel: "noopener" } : {})}
        >
          {label}
        </a>
      ))}
    </footer>
  );
}
