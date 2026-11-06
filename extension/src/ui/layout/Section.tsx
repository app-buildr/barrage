// Éléments de mise en page des options : carte blanche, aide, compte rendu.
import type { ComponentProps } from "react";
import { cn } from "@/ui/lib/utils";

export function Panel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card border border-line bg-card p-7 shadow-soft max-[560px]:p-5", className)}
      {...props}
    />
  );
}

export type StatusKind = "ok" | "warn" | "error";

const STATUS_COLORS: Record<StatusKind, string> = {
  ok: "text-coral-deep",
  warn: "text-sun-soft-ink",
  error: "text-state-problem",
};

type StatusProps = { kind?: StatusKind | undefined; message?: string | null | undefined; className?: string };

/** Compte rendu d'une action, annoncé aux lecteurs d'écran. Sans message, il ne prend pas de place. */
export function StatusMessage({ kind, message, className }: StatusProps) {
  return (
    <p role="status" aria-live="polite" className={cn("m-0 text-sm empty:hidden", kind && STATUS_COLORS[kind], className)}>
      {message}
    </p>
  );
}

export function Hint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("mt-3 text-sm text-muted-foreground", className)} {...props} />;
}
