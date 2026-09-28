// Shapes the consolidated monthly report payload into one flat object the
// dashboard can read directly, and derives the cumulative trailing rows.

import { num } from "./format";

function normalizeSummary(item) {
  return {
    type: item.type || "",
    period: item.period || "",
    stock_pnl: item.stock_pnl ?? item.stockPnl ?? 0,
    dividend: item.dividend ?? 0,
    special_cost: item.special_cost ?? item.specialCost ?? 0,
    period_gl: item.period_gl ?? item.periodGl ?? 0,
  };
}

export function parseReport(json) {
  const p = (Array.isArray(json) ? json[0] : json) || {};

  return {
    yearMonth: p.year_month || "",
    previousMonth: p.previous_month || "",
    retrievalDatetime: p.market_data?.retrieval_datetime || "",
    marketData: p.market_data || {},

    holdings: p.portfolio_performance?.holdings || [],
    holdingsSummary: p.portfolio_performance?.summary || {},

    monthlyPerformance: p.monthly_performance?.performance || [],
    monthlyTotals: p.monthly_performance?.totals || {},

    dividends: p.dividends?.dividends || [],
    totalDividends: p.dividends?.total_dividend || 0,
    totalAllDividends: p.dividends?.total_all_dividend || 0,

    allMonthlyPnl: p.all_monthly_pnl || [],
    quarterly: (p.quarterlyPnlSummary || p.quarterly_pnl_summary || []).map(normalizeSummary),
    annual: (p.annualPnlSummary || p.annual_pnl_summary || []).map(normalizeSummary),

    raw: p,
  };
}

/** Percentage move vs previous close, or null when unknown. */
export function priceChangePct(price, previousClose) {
  if (!previousClose) return null;
  return ((num(price) - num(previousClose)) / num(previousClose)) * 100;
}

/**
 * Running totals: current-year YTD, then each earlier quarter folded in,
 * producing labels like "2026 + 2025 Q3–Q4".
 */
export function buildTrailingRows(quarterly, annual) {
  if (!quarterly.length) return [];

  const sortedQ = [...quarterly].sort((a, b) => b.period.localeCompare(a.period));
  const annualByYear = Object.fromEntries(annual.map((a) => [a.period, a]));

  const currentYear = sortedQ[0].period.split("-")[0];
  const base = annualByYear[currentYear];
  if (!base) return [];

  let stock = base.stock_pnl;
  let dividend = base.dividend;
  let special = base.special_cost || 0;
  let gl = base.period_gl;

  const rows = [
    {
      label: `${currentYear} YTD`,
      stock_pnl: stock,
      dividend,
      special_cost: special,
      period_gl: gl,
    },
  ];

  const segments = [currentYear];
  let year = null;
  let high = null;
  let low = null;

  const label = (yr, lo, hi) => {
    if (lo === 1 && hi === 4) return yr;
    if (lo === hi) return `${yr} Q${lo}`;
    return `${yr} Q${lo}–Q${hi}`;
  };

  for (const q of sortedQ.filter((q) => !q.period.startsWith(currentYear))) {
    const [yr, qLabel] = q.period.split("-");
    const qn = parseInt(String(qLabel).replace("Q", ""), 10);

    stock += q.stock_pnl;
    dividend += q.dividend;
    special += q.special_cost || 0;
    gl += q.period_gl;

    if (yr !== year) {
      if (year !== null) segments.push(label(year, low, high));
      year = yr;
      high = qn;
      low = qn;
    } else {
      low = qn;
    }

    rows.push({
      label: [...segments, label(year, low, high)].join(" + "),
      stock_pnl: stock,
      dividend,
      special_cost: special,
      period_gl: gl,
    });
  }

  return rows;
}
