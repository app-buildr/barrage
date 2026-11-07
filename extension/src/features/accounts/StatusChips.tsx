// Puces de filtre par état : Tous, Bloqués, Visibles, Problèmes, Désactivés.
import { formatCount } from "@/core/format.ts";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/toggle-group.tsx";
import { cn } from "@/ui/lib/utils.ts";
import { CATEGORIES, totalCount, type Category, type Counts } from "./status.ts";

const LABELS: Record<Category, string> = {
  blocked: "Bloqués",
  visible: "Visibles",
  problem: "Problèmes",
  disabled: "Désactivés",
};

const DOTS: Record<Category, string> = {
  blocked: "bg-state-blocked",
  visible: "bg-state-visible",
  problem: "bg-state-problem",
  disabled: "bg-state-disabled",
};

const ALL = "all";

type Props = { counts: Counts; selected: Category | null; onSelect: (category: Category | null) => void };

export function StatusChips({ counts, selected, onSelect }: Props) {
  return (
    <ToggleGroup
      type="single"
      spacing={2}
      aria-label="Filtrer par état"
      value={selected ?? ALL}
      // Un nouveau clic sur la puce choisie la laisse choisie.
      onValueChange={(value) => value && onSelect(value === ALL ? null : (value as Category))}
      className="my-5 flex-wrap gap-2"
    >
      {[null, ...CATEGORIES].map((category) => (
        <ToggleGroupItem
          key={category ?? ALL}
          value={category ?? ALL}
          className={cn(
            "group h-11 gap-2 rounded-full border border-line bg-card px-4 text-body font-bold text-ink",
            "hover:bg-cream hover:text-ink data-[state=on]:border-coral-deep data-[state=on]:bg-coral-deep data-[state=on]:text-white",
          )}
        >
          {category ? (
            <span
              className={cn("size-2 flex-none rounded-full group-data-[state=on]:hidden", DOTS[category])}
              aria-hidden="true"
            />
          ) : null}
          {category ? LABELS[category] : "Tous"}
          <span className="font-medium text-muted-foreground group-data-[state=on]:font-bold group-data-[state=on]:text-white">
            {formatCount(category ? counts[category] : totalCount(counts))}
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
