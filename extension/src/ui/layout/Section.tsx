// Éléments de mise en page des options : carte blanche, encart, champ en pilule,
// aide, compte rendu.
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/ui/components/input.tsx";
import { cn } from "@/ui/lib/utils.ts";

export function Panel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card border border-line bg-card p-7 shadow-soft max-xs:p-5", className)}
      {...props}
    />
  );
}

const CALLOUT_TONES = {
  sun: { box: "bg-sun-soft text-body", icon: "text-coral-deep", title: "text-base text-sun-soft-ink" },
  alert: { box: "border border-line bg-card text-base shadow-soft", icon: "text-state-problem", title: "text-state-problem" },
};

type CalloutProps = Omit<ComponentProps<"aside">, "title"> & {
  icon: LucideIcon;
  title?: ReactNode;
  action?: ReactNode;
  tone?: keyof typeof CALLOUT_TONES;
};

/** Encart icône, titre, texte et action. Le rôle ARIA reste au choix de l'appelant. */
export function Callout({ icon: Icon, title, action, tone = "sun", className, children, ...props }: CalloutProps) {
  const colors = CALLOUT_TONES[tone];
  return (
    <aside
      className={cn("flex items-center gap-3 rounded-step px-5 py-4 text-ink max-xs:flex-wrap", colors.box, className)}
      {...props}
    >
      <Icon className={cn("size-5 flex-none", colors.icon)} strokeWidth={2.2} aria-hidden="true" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        {title ? <strong className={colors.title}>{title}</strong> : null}
        <div>{children}</div>
      </div>
      {action}
    </aside>
  );
}

/** Grand champ en pilule, à compléter par son fond. */
export function PillInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <Input
      spellCheck={false}
      autoComplete="off"
      className={cn(
        "h-[52px] min-w-0 flex-1 rounded-full px-5 text-base shadow-none md:text-base focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-coral-deep",
        className,
      )}
      {...props}
    />
  );
}

export type StatusKind = "ok" | "warn" | "error";

/** Couleur d'un compte rendu ou d'un état affiché en texte. */
export type Tone = StatusKind | "muted";

export const TONE_COLORS: Record<Tone, string> = {
  ok: "text-coral-deep",
  warn: "text-sun-soft-ink",
  error: "text-state-problem",
  muted: "text-muted-foreground",
};

export type StatusReport = { message: string; kind: Tone };

type StatusProps = { kind?: Tone | undefined; message?: string | null | undefined; className?: string };

/**
 * Compte rendu d'une action, annoncé aux lecteurs d'écran. Sans message, il ne
 * prend pas de place, mais reste dans l'arbre d'accessibilité : une région qui
 * surgit avec son texte n'est pas annoncée partout.
 */
export function StatusMessage({ kind, message, className }: StatusProps) {
  return (
    <p role="status" aria-live="polite" className={cn("m-0 text-sm empty:sr-only", kind && TONE_COLORS[kind], className)}>
      {message}
    </p>
  );
}

export function Hint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("mt-3 text-sm text-muted-foreground", className)} {...props} />;
}
