import { LOCALE } from "@/data/config";
import type { Cents } from "@/types/domain";

const priceFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/** 950 -> "9,50 €" */
export function formatPrice(cents: Cents): string {
  return priceFormatter.format(cents / 100);
}

/** Aufpreis mit Vorzeichen: 150 -> "+1,50 €", 0 -> "" */
export function formatSurcharge(cents: Cents): string {
  if (cents === 0) return "";
  const sign = cents > 0 ? "+" : "−";
  return `${sign}${priceFormatter.format(Math.abs(cents) / 100)}`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} Std. ${rest} Min.` : `${h} Std.`;
}

const timeFormatter = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });

export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

/** "11:00" -> 660 (Minuten seit Mitternacht) */
export function parseClock(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}
