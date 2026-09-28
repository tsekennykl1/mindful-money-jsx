import { DataTable } from "./Ui";
import { dollars, moneyClass, num } from "../lib/format";

/**
 * Quarterly / annual / trailing performance share one shape, so they share
 * one table. `inclDividend` swaps the middle column for Stock + Dividend.
 */
export default function PeriodTable({ rows, periodKey = "period", inclDividend = false, empty }) {
  const midHeader = inclDividend ? "Stock+Div" : "Dividend";
  const midValue = (r) => (inclDividend ? num(r.stock_pnl) + num(r.dividend) : r.dividend);

  return (
    <DataTable
      rows={rows}
      empty={empty}
      rowKey={(r, i) => r[periodKey] || i}
      columns={[
        {
          key: "period",
          header: "Period",
          cell: (r) => <span className="font-semibold whitespace-nowrap">{r[periodKey] || "—"}</span>,
        },
        {
          key: "stock",
          header: "Stock P&L",
          align: "right",
          cell: (r) => <span className={`num ${moneyClass(r.stock_pnl)}`}>{dollars(r.stock_pnl)}</span>,
        },
        {
          key: "mid",
          header: midHeader,
          align: "right",
          cell: (r) => <span className={`num ${moneyClass(midValue(r))}`}>{dollars(midValue(r))}</span>,
        },
        {
          key: "gl",
          header: "Period G/L",
          align: "right",
          cell: (r) => (
            <span className={`num font-bold ${moneyClass(r.period_gl)}`}>{dollars(r.period_gl)}</span>
          ),
        },
      ]}
    />
  );
}
