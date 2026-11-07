// Champ de recherche d'une liste de comptes.
import { Search } from "lucide-react";
import { PillInput } from "@/ui/layout/Section.tsx";

export function SearchInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-5 size-[18px] -translate-y-1/2 text-muted-foreground"
        strokeWidth={2.2}
        aria-hidden="true"
      />
      <PillInput
        type="search"
        placeholder="Rechercher un compte…"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-card pl-12"
      />
    </div>
  );
}
