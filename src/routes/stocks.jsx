import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { ENDPOINTS, authFetch } from "../lib/api";
import MOCK_STOCKS from "../data/mockStocks";
import {
  Page,
  PageHeader,
  Card,
  DataTable,
  Spinner,
  ErrorNote,
  Button,
  inputClass,
} from "../components/Ui";
import { decimal, integer } from "../lib/format";

export const Route = createFileRoute("/stocks")({
  head: () => ({
    meta: [
      { title: "Live Stock Prices | Personal Finance" },
      { name: "description", content: "Look up live prices, ranges, volume and P/E for any list of tickers." },
      { property: "og:title", content: "Live Stock Prices | Personal Finance" },
      { property: "og:description", content: "Look up live prices, ranges, volume and P/E for any list of tickers." },
    ],
  }),
  component: StocksPage,
});

function StocksPage() {
  const [codes, setCodes] = useState("0700.HK,0005.HK,1888.HK,2318.HK,0941.HK");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState("");

  const load = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setWarning("");
    try {
      const res = await authFetch(`${ENDPOINTS.STOCK}?stocks=${encodeURIComponent(codes.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      // The quote API is flaky — fall back to the bundled snapshot rather than showing nothing.
      setData(MOCK_STOCKS);
      setWarning(`Live quotes unavailable (${err.message}) — showing sample data.`);
    }
    setLoading(false);
  };

  const rows = data ? Object.entries(data).map(([symbol, d]) => ({ symbol, ...d })) : [];

  return (
    <Page>
      <PageHeader title="Stock Prices" subtitle="Live quotes via yfinance" back="/" />

      <Card className="p-2.5">
        <form onSubmit={load} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Stock codes (comma separated)
            </span>
            <input
              className={inputClass}
              value={codes}
              onChange={(e) => setCodes(e.target.value)}
              placeholder="0700.HK, AAPL"
            />
          </label>
          <Button variant="primary" type="submit" disabled={loading}>
            <Search size={13} /> {loading ? "Loading…" : "Get quotes"}
          </Button>
        </form>
      </Card>

      <ErrorNote tone="warn">{warning}</ErrorNote>

      <Card>
        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(r) => r.symbol}
            empty="Enter stock codes and tap Get quotes."
            columns={[
              { key: "symbol", header: "Code", sticky: true, cell: (r) => r.symbol },
              {
                key: "name",
                header: "Name",
                priority: 2,
                cell: (r) => (
                  <span className="block max-w-[160px] truncate text-muted-foreground">
                    {r.shortName_en || "—"}
                  </span>
                ),
              },
              {
                key: "price",
                header: "Price",
                align: "right",
                cell: (r) => <span className="num font-bold">{decimal(r.price)}</span>,
              },
              { key: "high", header: "High", align: "right", cell: (r) => <span className="num">{decimal(r.high)}</span> },
              { key: "low", header: "Low", align: "right", cell: (r) => <span className="num">{decimal(r.low)}</span> },
              {
                key: "open",
                header: "Open",
                align: "right",
                priority: 2,
                cell: (r) => <span className="num">{decimal(r.open)}</span>,
              },
              {
                key: "prev",
                header: "Prev",
                align: "right",
                priority: 2,
                cell: (r) => <span className="num">{decimal(r.previousClose)}</span>,
              },
              {
                key: "volume",
                header: "Volume",
                align: "right",
                priority: 3,
                cell: (r) => <span className="num">{integer(r.volume)}</span>,
              },
              {
                key: "sector",
                header: "Sector",
                priority: 3,
                cell: (r) => (
                  <span className="block max-w-[180px] truncate text-muted-foreground">
                    {r.sector || "—"}
                  </span>
                ),
              },
              {
                key: "pe",
                header: "P/E",
                align: "right",
                priority: 2,
                cell: (r) => <span className="num">{decimal(r.peRatio)}</span>,
              },
            ]}
          />
        )}
      </Card>
    </Page>
  );
}
