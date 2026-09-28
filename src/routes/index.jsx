import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LineChart, ArrowLeftRight, Coins, NotebookPen, RefreshCw } from "lucide-react";

import { ENDPOINTS, authFetch } from "../lib/api";
import { parseReport, buildTrailingRows, priceChangePct } from "../lib/report";
import { useAsyncData } from "../lib/useAsyncData";
import {
  Page,
  PageHeader,
  Section,
  StatGrid,
  Stat,
  DataTable,
  Pill,
  Spinner,
  ErrorNote,
  Button,
} from "../components/Ui";
import PeriodTable from "../components/PeriodTable";
import {
  dollars,
  decimal,
  integer,
  percent,
  moneyClass,
  tone,
  stripHK,
  num,
  currentYearMonth,
} from "../lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Portfolio Dashboard | Personal Finance" },
      {
        name: "description",
        content:
          "Monthly portfolio dashboard: holdings, stock performance, dividends, ledger profit and loss, and quarterly and annual results.",
      },
      { property: "og:title", content: "Portfolio Dashboard | Personal Finance" },
      {
        property: "og:description",
        content:
          "Monthly portfolio dashboard: holdings, stock performance, dividends, ledger profit and loss, and quarterly and annual results.",
      },
    ],
  }),
  component: Dashboard,
});

const NAV = [
  { to: "/stocks", label: "Stock Prices", icon: LineChart },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/dividends", label: "Dividends", icon: Coins },
  { to: "/ledger", label: "Ledger", icon: NotebookPen },
];

function NavPill({ to, label, icon: Icon }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-accent sm:text-xs"
    >
      <Icon size={13} className="text-primary" />
      {label}
    </Link>
  );
}

function Delta({ price, previousClose }) {
  const pct = priceChangePct(price, previousClose);
  return (
    <span className="num">
      {decimal(price)}
      {pct === null ? null : (
        <span
          className={`ml-1 ${pct > 0 ? "text-pos" : pct < 0 ? "text-neg" : "text-muted-foreground"} ${
            Math.abs(pct) > 10 ? "font-bold" : ""
          }`}
        >
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      )}
    </span>
  );
}

function Dashboard() {
  const [month, setMonth] = useState("");

  const { data, loading, error, reload } = useAsyncData(
    async (signal) => {
      const url = month ? ENDPOINTS.REPORT(month) : ENDPOINTS.REPORT_CURRENT;
      const res = await authFetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseReport(await res.json());
    },
    [month],
    { cacheKey: `report_${month || "current"}` }
  );

  const report = data || parseReport(null);
  const yearMonth = report.yearMonth || currentYearMonth();

  const holdings = useMemo(
    () => [...report.holdings].sort((a, b) => num(b.total_invested) - num(a.total_invested)),
    [report.holdings]
  );

  const pnlRows = useMemo(
    () =>
      [...report.allMonthlyPnl].sort((a, b) =>
        String(b.year_month || "").localeCompare(String(a.year_month || ""))
      ),
    [report.allMonthlyPnl]
  );

  const currentPnl = pnlRows[0] || null;
  const trailing = useMemo(
    () => buildTrailingRows(report.quarterly, report.annual),
    [report.quarterly, report.annual]
  );

  const hs = report.holdingsSummary || {};
  const mt = report.monthlyTotals || {};
  const previousClose = (symbol) => report.marketData?.[symbol]?.previousClose || 0;

  return (
    <Page>
      <PageHeader
        title="Personal Finance"
        subtitle={report.retrievalDatetime ? `Prices as of ${report.retrievalDatetime}` : "Monthly report"}
        badges={<Pill tone="onDark">Month {yearMonth}</Pill>}
        actions={
          <Button variant="onDark" type="button" onClick={reload} disabled={loading}>
            <RefreshCw size={13} className={loading ? "spin-slow" : ""} />
            {loading ? "Loading" : "Refresh"}
          </Button>
        }
      />

      <nav className="scroll-x flex gap-1.5 pb-0.5">
        {NAV.map((item) => (
          <NavPill key={item.to} {...item} />
        ))}
      </nav>

      <ErrorNote>{error}</ErrorNote>
      {loading && !data ? <Spinner /> : null}

      {/* ── Portfolio holdings ── */}
      <Section
        title="Portfolio Holdings"
        badge={
          hs.total_gain_loss_amount !== undefined ? (
            <Pill tone={tone(hs.total_gain_loss_amount) === "neg" ? "neg" : "pos"}>
              {dollars(hs.total_gain_loss_amount)}
            </Pill>
          ) : null
        }
      >
        <StatGrid cols="grid-cols-3">
          <Stat label="Invested" value={dollars(hs.total_invested)} />
          <Stat label="Value" value={dollars(hs.total_current_value)} />
          <Stat
            label="Profit / Loss"
            value={dollars(hs.total_gain_loss_amount)}
            tone={tone(hs.total_gain_loss_amount)}
            hint={percent(hs.total_gain_loss_percentage)}
          />
        </StatGrid>
        <DataTable
          rows={holdings}
          rowKey={(r) => r.symbol}
          empty="No holdings"
          columns={[
            { key: "code", header: "Code", sticky: true, cell: (r) => stripHK(r.symbol) || "—" },
            {
              key: "name",
              header: "Name",
              priority: 3,
              cell: (r) => (
                <span className="block max-w-[180px] truncate text-muted-foreground">
                  {r.stock_name || r.shortName_en || "—"}
                </span>
              ),
            },
            { key: "qty", header: "Qty", align: "right", cell: (r) => <span className="num">{integer(r.quantity)}</span> },
            {
              key: "avg",
              header: "Avg",
              align: "right",
              priority: 2,
              cell: (r) => <span className="num">{decimal(r.avg_price)}</span>,
            },
            {
              key: "price",
              header: "Price",
              align: "right",
              cell: (r) => <Delta price={r.current_price} previousClose={previousClose(r.symbol)} />,
            },
            {
              key: "gl",
              header: "P/L",
              align: "right",
              cell: (r) => (
                <span className={`num font-semibold ${moneyClass(r.gain_loss_amount)}`}>
                  {dollars(r.gain_loss_amount)}
                  <span className="ml-1 text-[10px] opacity-80">{percent(r.gain_loss_percentage)}</span>
                </span>
              ),
            },
            {
              key: "invested",
              header: "Invested",
              align: "right",
              priority: 2,
              cell: (r) => <span className="num">{dollars(r.total_invested)}</span>,
            },
            {
              key: "value",
              header: "Value",
              align: "right",
              priority: 2,
              cell: (r) => <span className="num">{dollars(r.current_value)}</span>,
            },
          ]}
        />
      </Section>

      {/* ── Current month stock performance ── */}
      <Section
        title="This Month's Stock Performance"
        badge={
          mt.total_net_diff !== undefined ? (
            <Pill tone={tone(mt.total_net_diff) === "neg" ? "neg" : "pos"}>
              Net {dollars(mt.total_net_diff)}
            </Pill>
          ) : null
        }
      >
        <StatGrid cols="grid-cols-3">
          <Stat label="Start Value" value={dollars(mt.total_start_value)} />
          <Stat label="Current Value" value={dollars(mt.total_current_value)} />
          <Stat
            label="Realized G/L"
            value={dollars(mt.total_realized_gl)}
            tone={tone(mt.total_realized_gl)}
          />
        </StatGrid>
        <DataTable
          rows={report.monthlyPerformance}
          rowKey={(r) => r.symbol}
          empty="No performance rows"
          columns={[
            { key: "code", header: "Code", sticky: true, cell: (r) => stripHK(r.symbol) || "—" },
            {
              key: "sq",
              header: "S-Qty",
              align: "right",
              priority: 2,
              cell: (r) => <span className="num">{integer(r.start_qty)}</span>,
            },
            {
              key: "sp",
              header: "S-Price",
              align: "right",
              priority: 2,
              cell: (r) => <span className="num">{decimal(r.start_price)}</span>,
            },
            {
              key: "aq",
              header: "Adj-Qty",
              align: "right",
              cell: (r) => (
                <span className={`num ${r.adjusted_qty !== r.start_qty ? "font-bold text-info" : ""}`}>
                  {integer(r.adjusted_qty)}
                </span>
              ),
            },
            { key: "cp", header: "Price", align: "right", cell: (r) => <span className="num">{decimal(r.current_price)}</span> },
            {
              key: "pnl",
              header: "PnL",
              align: "right",
              cell: (r) => <span className={`num ${moneyClass(r.realized_gl)}`}>{dollars(r.realized_gl)}</span>,
            },
            {
              key: "diff",
              header: "Net Diff",
              align: "right",
              cell: (r) => (
                <span className={`num font-semibold ${moneyClass(r.month_net_diff)}`}>
                  {dollars(r.month_net_diff)}
                </span>
              ),
            },
            {
              key: "sv",
              header: "Start Val",
              align: "right",
              priority: 3,
              cell: (r) => <span className="num">{dollars(r.start_value)}</span>,
            },
            {
              key: "cv",
              header: "Cur Val",
              align: "right",
              priority: 3,
              cell: (r) => <span className="num">{dollars(r.current_value)}</span>,
            },
          ]}
        />
      </Section>

      {/* ── Dividends ── */}
      <Section
        title="Dividends"
        badge={<Pill tone="pos">{dollars(report.totalDividends)}</Pill>}
        right={
          <Pill tone="neutral">All {dollars(report.totalAllDividends)}</Pill>
        }
      >
        <DataTable
          rows={report.dividends}
          rowKey={(r, i) => `${r.symbol}-${r.payment_date}-${i}`}
          empty="No dividends this month"
          columns={[
            { key: "code", header: "Code", sticky: true, cell: (r) => stripHK(r.symbol) || "—" },
            {
              key: "name",
              header: "Stock",
              priority: 3,
              cell: (r) => (
                <span className="block max-w-[180px] truncate text-muted-foreground">
                  {r.stock_name || "—"}
                </span>
              ),
            },
            { key: "pay", header: "Paid", cell: (r) => <span className="num">{(r.payment_date || "—").slice(0, 10)}</span> },
            {
              key: "ex",
              header: "Ex-Div",
              priority: 2,
              cell: (r) => <span className="num">{(r.ex_dividend_date || "—").slice(0, 10)}</span>,
            },
            { key: "qty", header: "Qty", align: "right", cell: (r) => <span className="num">{integer(r.quantity)}</span> },
            {
              key: "aps",
              header: "@Share",
              align: "right",
              priority: 2,
              cell: (r) => <span className="num">{decimal(r.amount_per_share, 4)}</span>,
            },
            {
              key: "amt",
              header: "Amount",
              align: "right",
              cell: (r) => <span className="num font-semibold text-pos">{dollars(r.dividend_amount)}</span>,
            },
          ]}
        />
      </Section>

      {/* ── Current month P&L ── */}
      <Section title="This Month's Profit & Loss">
        {currentPnl ? (
          <StatGrid cols="grid-cols-2 sm:grid-cols-4">
            <Stat label="Open" value={dollars(currentPnl.open_bal)} />
            <Stat label="Income" value={dollars(currentPnl.income)} tone="pos" />
            <Stat label="Expenses" value={dollars(currentPnl.expenses)} tone="neg" />
            <Stat label="Mortgage" value={dollars(currentPnl.mortgage)} tone={tone(currentPnl.mortgage)} />
            <Stat label="Stock P&L" value={dollars(currentPnl.stock_pnl)} tone={tone(currentPnl.stock_pnl)} />
            <Stat label="Dividend" value={dollars(currentPnl.dividend)} tone="pos" />
            <Stat label="Close" value={dollars(currentPnl.close_bal)} />
            <Stat
              label="Monthly G/L"
              value={dollars(currentPnl.monthly_gl)}
              tone={tone(currentPnl.monthly_gl)}
              highlight
            />
          </StatGrid>
        ) : (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">No P&L rows</div>
        )}
      </Section>

      {/* ── Quarterly & annual ── */}
      <Section
        title="Quarterly & Annual"
        badge={<Pill tone="info">{report.quarterly.length}Q · {report.annual.length}Y</Pill>}
      >
        <div className="border-b border-border px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
          Quarterly
        </div>
        <PeriodTable rows={report.quarterly} empty="No quarterly data" />
        <div className="border-y border-border px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
          Annual
        </div>
        <PeriodTable rows={report.annual} empty="No annual data" />
        <div className="border-y border-border px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
          Trailing cumulative
        </div>
        <PeriodTable rows={trailing} periodKey="label" inclDividend empty="No trailing data" />
      </Section>

      {/* ── All months ── */}
      <Section
        title="All Months Profit & Loss"
        defaultOpen={false}
        badge={<Pill tone="neutral">{pnlRows.length} rows</Pill>}
      >
        <DataTable
          rows={pnlRows}
          rowKey={(r) => r.year_month}
          empty="No monthly rows"
          columns={[
            { key: "ym", header: "Month", sticky: true, cell: (r) => <span className="num">{r.year_month || "—"}</span> },
            { key: "open", header: "Open", align: "right", priority: 2, cell: (r) => <span className="num">{dollars(r.open_bal)}</span> },
            { key: "inc", header: "Income", align: "right", cell: (r) => <span className="num text-pos">{dollars(r.income)}</span> },
            { key: "exp", header: "Expenses", align: "right", cell: (r) => <span className="num text-neg">{dollars(r.expenses)}</span> },
            { key: "mort", header: "Mortgage", align: "right", priority: 2, cell: (r) => <span className="num">{dollars(r.mortgage)}</span> },
            { key: "stock", header: "Stock", align: "right", priority: 2, cell: (r) => <span className={`num ${moneyClass(r.stock_pnl)}`}>{dollars(r.stock_pnl)}</span> },
            { key: "div", header: "Div", align: "right", priority: 2, cell: (r) => <span className="num text-pos">{dollars(r.dividend)}</span> },
            {
              key: "gl",
              header: "G/L",
              align: "right",
              cell: (r) => <span className={`num font-bold ${moneyClass(r.monthly_gl)}`}>{dollars(r.monthly_gl)}</span>,
            },
            { key: "close", header: "Close", align: "right", priority: 3, cell: (r) => <span className="num">{dollars(r.close_bal)}</span> },
          ]}
        />
      </Section>
    </Page>
  );
}
