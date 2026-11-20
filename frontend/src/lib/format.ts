import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

const currencyFormatter = new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" });
const compactFormatter = new Intl.NumberFormat("de-CH", { notation: "compact", maximumFractionDigits: 1 });
const numberFormatter = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 });

/** 123456 Rappen -> "CHF 1’234.56" */
export function formatCHF(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

/** Amount without currency, e.g. for input fields: "1234.56" */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatAmount(cents: number): string {
  return numberFormatter.format(cents / 100);
}

/** Short chart axis labels without currency and decimals. */
export function formatCompactCHF(cents: number): string {
  return compactFormatter.format(cents / 100);
}

export function formatPercent(value: number | null, signed = false): string {
  if (value === null) return "–";
  const text = `${percentFormatter.format(value)} %`;
  return signed && value > 0 ? `+${text}` : text;
}

export function formatTransactionCount(count: number): string {
  return `${count} ${count === 1 ? "Transaktion" : "Transaktionen"}`;
}

/** "2026-03-01" -> "01.03.2026" */
export function formatDate(iso: string): string {
  return format(parseISO(iso), "dd.MM.yyyy");
}

export function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** "2026-03" -> "Mär 26", "2026-03-05" -> "05.03." */
export function formatPeriodLabel(period: string): string {
  if (period.length === 7) return format(parseISO(`${period}-01`), "MMM yy", { locale: de });
  return format(parseISO(period), "dd.MM.");
}

export function formatPeriodLong(period: string): string {
  if (period.length === 7) return format(parseISO(`${period}-01`), "MMMM yyyy", { locale: de });
  return format(parseISO(period), "EEEE, dd.MM.yyyy", { locale: de });
}

/**
 * Parse a user-entered amount ("12.50", "12,50", "1'234.5") into Rappen.
 * Uses string arithmetic so no floating-point rounding is involved.
 */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[\s'’]/g, "").replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
