// Champ de recherche d'une liste de comptes.
import { Search } from "lucide-react";
import { Input } from "@/ui/components/input";

export function SearchInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-5 size-[18px] -translate-y-1/2 text-muted-foreground"
        strokeWidth={2.2}
        aria-hidden="true"
      />
      <Input
        type="search"
        spellCheck={false}
        autoComplete="off"
        placeholder="Rechercher un compte…"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[52px] rounded-full border-line bg-card pr-5 pl-12 text-base shadow-none md:text-base focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-coral-deep"
      />
    </div>
  );
}
