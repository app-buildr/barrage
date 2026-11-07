import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Sans cette déclaration, text-body serait pris pour une couleur et disparaîtrait devant text-ink. */
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["body", "label"] } } });

/** Classes Tailwind fusionnées : la dernière l'emporte en cas de conflit. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
