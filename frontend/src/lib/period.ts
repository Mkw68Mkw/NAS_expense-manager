import { differenceInCalendarDays, endOfMonth, endOfYear, parseISO, startOfMonth, startOfYear, subMonths } from "date-fns";
import { toISODate } from "./format";
import type { Period } from "./types";

export type PeriodPreset = "current_month" | "last_month" | "last_3_months" | "current_year" | "custom";

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "current_month", label: "Aktueller Monat" },
  { value: "last_month", label: "Letzter Monat" },
  { value: "last_3_months", label: "Letzte 3 Monate" },
  { value: "current_year", label: "Aktuelles Jahr" },
  { value: "custom", label: "Benutzerdefiniert" },
];

export function presetToPeriod(preset: Exclude<PeriodPreset, "custom">, today = new Date()): Period {
  switch (preset) {
    case "current_month":
      return { from: toISODate(startOfMonth(today)), to: toISODate(endOfMonth(today)) };
    case "last_month": {
      const last = subMonths(today, 1);
      return { from: toISODate(startOfMonth(last)), to: toISODate(endOfMonth(last)) };
    }
    case "last_3_months":
      return { from: toISODate(startOfMonth(subMonths(today, 2))), to: toISODate(endOfMonth(today)) };
    case "current_year":
      return { from: toISODate(startOfYear(today)), to: toISODate(endOfYear(today)) };
  }
}

export function periodLengthDays(period: Period): number {
  return differenceInCalendarDays(parseISO(period.to), parseISO(period.from)) + 1;
}

/** Daily buckets for short periods, monthly otherwise. */
export function granularityFor(period: Period): "day" | "month" {
  return periodLengthDays(period) <= 62 ? "day" : "month";
}
