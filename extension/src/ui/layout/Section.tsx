// Carte blanche de la page d'options : notifications, progression, tableau, ajout.
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

export function Hint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("mt-3 text-sm text-muted-foreground", className)} {...props} />;
}
