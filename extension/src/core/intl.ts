// Dates, durées et énumérations des options et du service worker, sur Intl. Les
// formateurs sont créés au chargement : ce module n'est pas lu par le content
// script, injecté sur chaque onglet x.com. Testé dans tests/format.test.ts.
import { LOCALE } from "./format.ts";

const AND = new Intl.ListFormat(LOCALE, { type: "conjunction" });
const OR = new Intl.ListFormat(LOCALE, { type: "disjunction" });
const AGO = new Intl.RelativeTimeFormat(LOCALE, { style: "short" });
const SHORT_DATE = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" });
const LONG_DATE = new Intl.DateTimeFormat(LOCALE, { dateStyle: "long" });
const TIME = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
const DAY_TIME = new Intl.DateTimeFormat(LOCALE, { weekday: "long", hour: "2-digit", minute: "2-digit" });

/** « a, b et c » ou « a, b ou c ». */
export const formatList = (items: readonly string[], link: "and" | "or"): string =>
  (link === "and" ? AND : OR).format(items);

/** « il y a 2 h », d'après l'écart en millisecondes. */
export function formatAgo(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return AGO.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? AGO.format(-hours, "hour") : AGO.format(-Math.floor(hours / 24), "day");
}

/** « 3 nov. » */
export const formatShortDate = (at: number): string => SHORT_DATE.format(at);

/** « 3 novembre 2026 » */
export const formatLongDate = (at: number): string => LONG_DATE.format(at);

/** « 14:32 », avec le jour si ce n'est pas aujourd'hui. */
export function formatClock(at: number): string {
  return (new Date(at).toDateString() === new Date().toDateString() ? TIME : DAY_TIME).format(at);
}
