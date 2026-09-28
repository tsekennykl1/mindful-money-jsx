// The "Daily" ledger row stores its per-item breakdown inside its comment:
//
//   ["Lunch"=60, "Travel"=15]
//   ["Lunch"="ramen", "Travel"=""]
//
// Line 2 only appears when at least one note is filled in.

import { num } from "./format";

export const DEFAULT_DAILY_ROWS = ["Breakfast", "Lunch", "Dinner", "Travel"].map((category) => ({
  category,
  amount: "",
  notes: "",
}));

/** "" / null means "not entered" and is skipped; anything numeric is kept. */
export function amountOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Drop rows without both a category and a usable amount. */
export function cleanRows(rows) {
  return rows
    .map((r) => ({
      category: String(r.category || "").trim(),
      amount: amountOrNull(r.amount),
      notes: String(r.notes || "").trim(),
    }))
    .filter((r) => r.category && r.amount !== null);
}

const esc = (s) => String(s).replaceAll('"', '\\"');

export function buildDailyComment(rows) {
  const items = cleanRows(rows);
  const amounts = `[${items.map((r) => `"${esc(r.category)}"=${r.amount}`).join(", ")}]`;
  if (!items.some((r) => r.notes)) return amounts;

  const notes = `[${items
    .map((r) => `"${esc(r.category)}"="${esc(r.notes.replaceAll("\n", " "))}"`)
    .join(", ")}]`;
  return `${amounts}\n${notes}`;
}

function bracketBlocks(comment) {
  const s = String(comment || "");
  const blocks = [];
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf("[", i);
    if (start === -1) break;
    const end = s.indexOf("]", start + 1);
    if (end === -1) break;
    blocks.push(s.slice(start + 1, end));
    i = end + 1;
  }
  return blocks;
}

export function parseDailyComment(comment) {
  let items = null;
  let notes = null;

  for (const inside of bracketBlocks(comment)) {
    if (!items) {
      const found = [...inside.matchAll(/"([^"]+)"\s*=\s*(-?\d+(?:\.\d+)?)/g)].map((m) => ({
        category: m[1],
        amount: Number(m[2]),
      }));
      if (found.length) {
        items = found;
        continue;
      }
    }
    if (items && !notes) {
      const found = [...inside.matchAll(/"([^"]+)"\s*=\s*"([^"]*)"/g)];
      if (found.length) notes = new Map(found.map((m) => [m[1], m[2]]));
    }
  }

  return { items, notes };
}

/** Merge a parsed comment back onto the default row set, keeping extra categories. */
export function rowsFromComment(comment) {
  const { items, notes } = parseDailyComment(comment);
  if (!items) return DEFAULT_DAILY_ROWS.map((r) => ({ ...r }));

  const amounts = new Map(items.map((i) => [i.category, i.amount]));
  const rows = DEFAULT_DAILY_ROWS.map((r) => ({
    category: r.category,
    amount: amounts.has(r.category) ? String(amounts.get(r.category)) : "",
    notes: notes?.get(r.category) ?? "",
  }));

  for (const item of items) {
    if (!rows.some((r) => r.category === item.category)) {
      rows.push({
        category: item.category,
        amount: String(item.amount),
        notes: notes?.get(item.category) ?? "",
      });
    }
  }
  return rows;
}

export function rowsTotal(rows) {
  return cleanRows(rows).reduce((s, r) => s + num(r.amount), 0);
}
