// Barre d'onglets principale : Comptes, Badges, Réglages. Clavier géré par
// Radix. La pastille de l'onglet actif glisse d'un onglet à l'autre.
import { type FocusEvent, useLayoutEffect, useRef, useState } from "react";
import { TabsList, TabsTrigger } from "@/ui/components/tabs.tsx";
import type { MainTab } from "./main-tab.ts";

type Pill = { left: number; width: number };

export function MainTabList({ tab, badgesLabel }: { tab: MainTab; badgesLabel: string }) {
  const list = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<Pill | null>(null);
  const [animated, setAnimated] = useState(false);
  // Le contour de focus reste réservé au clavier : rien au clic.
  const [pointer, setPointer] = useState(false);

  useLayoutEffect(() => {
    const root = list.current;
    if (!root) return;
    const measure = () => {
      const active = root.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    // Les polices et le libellé des badges changent la largeur des onglets.
    const observer = new ResizeObserver(measure);
    for (const trigger of root.querySelectorAll('[role="tab"]')) observer.observe(trigger);
    return () => observer.disconnect();
  }, [tab, badgesLabel]);

  // Pas de glissement à l'arrivée sur la page : la pastille est déjà en place.
  useLayoutEffect(() => {
    if (pill && !animated) requestAnimationFrame(() => setAnimated(true));
  }, [pill, animated]);

  const leaveList = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setPointer(false);
  };

  const trigger =
    "relative z-1 h-11 flex-none cursor-pointer rounded-full border-0 px-5 text-[15px] font-bold text-ink transition-colors duration-200 hover:text-ink data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none group-data-pointer/tabs-list:outline-none! group-data-pointer/tabs-list:ring-0!";

  return (
    <TabsList
      ref={list}
      aria-label="Sections"
      data-pointer={pointer ? "" : undefined}
      onPointerDown={() => setPointer(true)}
      onKeyDown={() => setPointer(false)}
      onBlur={leaveList}
      className="relative h-auto gap-1 rounded-full border border-line bg-card p-1.5 shadow-soft group-data-[orientation=horizontal]/tabs:h-auto"
    >
      {pill ? (
        <span
          aria-hidden="true"
          className={`absolute inset-y-1.5 left-0 rounded-full bg-ink motion-reduce:transition-none ${animated ? "transition-[transform,width] duration-250 ease-barrage" : ""}`}
          style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
        />
      ) : null}
      <TabsTrigger value="comptes" className={trigger}>
        Comptes
      </TabsTrigger>
      <TabsTrigger value="badges" className={trigger}>
        {badgesLabel}
      </TabsTrigger>
      <TabsTrigger value="reglages" className={trigger}>
        Réglages
      </TabsTrigger>
    </TabsList>
  );
}
