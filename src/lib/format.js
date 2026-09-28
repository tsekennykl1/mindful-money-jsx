// One place for every number, money, date and symbol helper used by the app.

export function num(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function isBlank(value) {
  return value === null || value === undefined || value === "" || Number.isNaN(Number(value));
}

/** Whole-dollar money, e.g. -1,234 */
export function money(value) {
  if (isBlank(value)) return "—";
  const n = Math.round(num(value));
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Money with a leading $, e.g. $1,234 */
export function dollars(value) {
  if (isBlank(value)) return "$0";
  return `$${money(value)}`;
}

export function decimal(value, decimals = 2) {
  if (isBlank(value)) return "—";
  return num(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function integer(value) {
  if (isBlank(value)) return "—";
  return num(value).toLocaleString();
}

export function percent(value) {
  if (isBlank(value)) return "—";
  return `${decimal(value, 2)}%`;
}

/** "pos" | "neg" | "flat" — drives colour everywhere. */
export function tone(value) {
  const n = num(value);
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "flat";
}

export const toneClass = {
  pos: "text-pos",
  neg: "text-neg",
  flat: "text-foreground",
};

export function moneyClass(value) {
  return toneClass[tone(value)];
}

// ── Dates ───────────────────────────────────────────────

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Accepts 2026-08-31, 2026-08-31T.., 31/8/2026 — always returns YYYY-MM-DD or "". */
export function toISODate(value) {
  if (!value) return "";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parts = s.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function isISODate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// ── Stock symbols ───────────────────────────────────────

export function stripHK(symbol) {
  const s = String(symbol || "").trim();
  return s.toUpperCase().endsWith(".HK") ? s.slice(0, -3) : s;
}

/** Returns { symbol } or { error }. HK codes are digits, padded to 4. */
export function normalizeHKSymbol(raw) {
  const trimmed = String(raw || "").trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: "Hong Kong code must be digits only (e.g. 5, 700, 2628)" };
  }
  if (trimmed.length > 4) return { error: "Hong Kong code must be at most 4 digits" };
  return { symbol: trimmed.padStart(4, "0") };
}
