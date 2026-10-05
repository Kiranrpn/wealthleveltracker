const LAKH = 100_000;
const CRORE = 10_000_000;

const fullFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const plainFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function trimDecimals(value: number, digits: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

/** "₹12,34,567". Non-finite input shows "₹0". */
export function formatINR(value: number): string {
  return fullFormatter.format(Number.isFinite(value) ? value : 0);
}

/**
 * Compact Indian notation: "₹52.5 L", "₹2.1 Cr", "₹45,000".
 * Uses up to 2 decimals and trims trailing zeros.
 */
export function formatINRShort(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= CRORE) return `${sign}₹${trimDecimals(abs / CRORE, 2)} Cr`;
  if (abs >= LAKH) return `${sign}₹${trimDecimals(abs / LAKH, 2)} L`;
  return `${sign}${fullFormatter.format(abs)}`;
}

export function formatNumber(value: number): string {
  return plainFormatter.format(Number.isFinite(value) ? value : 0);
}

/** "12.4x". null or non-finite shows "n/a". */
export function formatRatio(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "n/a";
  return `${trimDecimals(ratio, ratio < 10 ? 2 : 1)}x`;
}

/** 0.45 -> "45%". */
export function formatPct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "0%";
  return `${trimDecimals(fraction * 100, digits)}%`;
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const monthFormatter = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "5 Oct 2026" from "2026-10-05". */
export function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : dateFormatter.format(d);
}

/** "Oct 2026" from "2026-10" or "2026-10-05". */
export function formatMonth(isoOrKey: string): string {
  const d = new Date(`${isoOrKey.slice(0, 7)}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? isoOrKey : monthFormatter.format(d);
}

/** Today's local date as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "3 yrs 4 mos", "7 mos", "now". */
export function formatDuration(months: number): string {
  if (!Number.isFinite(months) || months <= 0) return "now";
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} yr${y === 1 ? "" : "s"}`);
  if (m > 0) parts.push(`${m} mo${m === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** Parses a user-typed number like "1,50,000" or "52.5". Returns NaN for empty/invalid. */
export function parseAmount(text: string): number {
  const cleaned = text.replace(/[,\s₹]/g, "");
  if (cleaned === "") return Number.NaN;
  return Number(cleaned);
}
