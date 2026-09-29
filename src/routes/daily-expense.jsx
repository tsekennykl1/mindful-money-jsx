import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";

import { crud, clearCache } from "../lib/api";
import {
  Page,
  PageHeader,
  Card,
  Stat,
  StatGrid,
  Spinner,
  ErrorNote,
  Button,
  IconButton,
  DateInput,
  inputClass,
} from "../components/Ui";
import { dollars, isISODate, todayISO, toISODate } from "../lib/format";
import {
  DEFAULT_DAILY_ROWS,
  buildDailyComment,
  cleanRows,
  rowsFromComment,
  rowsTotal,
} from "../lib/dailyComment";

export const Route = createFileRoute("/daily-expense")({
  validateSearch: (search) => ({
    date: isISODate(search.date) ? search.date : undefined,
    ledger_id: Number.isFinite(Number(search.ledger_id)) && search.ledger_id ? Number(search.ledger_id) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Daily Expense Sheet | Personal Finance" },
      { name: "description", content: "Log one day of spending by category and save it as a single ledger entry." },
      { property: "og:title", content: "Daily Expense Sheet | Personal Finance" },
      { property: "og:description", content: "Log one day of spending by category and save it as a single ledger entry." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DailyExpensePage,
});

/** Find that day's existing "Daily" ledger row, by id when we have one. */
async function findDailyEntry(date, ledgerId, signal) {
  if (ledgerId) {
    const json = await crud("ledger", "get_by_id", { id: ledgerId }, { signal });
    if (json.data) return json.data;
  }
  const json = await crud("ledger", "get", { month_str: date.slice(0, 7) }, { signal });
  return (json.data || []).find(
    (r) => String(r.category) === "Daily" && toISODate(r.datetime || r.ledger_datetime) === date
  );
}

function DailyExpensePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [date, setDate] = useState(search.date || todayISO());
  const [ledgerId, setLedgerId] = useState(search.ledger_id ?? null);
  const [rows, setRows] = useState(DEFAULT_DAILY_ROWS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isISODate(date)) return;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const existing = await findDailyEntry(date, ledgerId, controller.signal);
        if (cancelled) return;
        setLedgerId(typeof existing?.id === "number" ? existing.id : null);
        setRows(existing ? rowsFromComment(existing.comment) : DEFAULT_DAILY_ROWS.map((r) => ({ ...r })));
      } catch (err) {
        if (cancelled || err.name === "AbortError") return;
        setError(err.message || "Failed to load this day's entry.");
        setRows(DEFAULT_DAILY_ROWS.map((r) => ({ ...r })));
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // ledgerId is only an entry hint; reloading on every change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const total = useMemo(() => rowsTotal(rows), [rows]);
  const preview = useMemo(() => (cleanRows(rows).length ? buildDailyComment(rows) : "[]"), [rows]);

  const updateRow = (index, patch) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { category: "", amount: "", notes: "" }]);
  const removeRow = (index) => setRows((prev) => prev.filter((_, i) => i !== index));

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    const items = cleanRows(rows);
    if (!items.length) return setError("Enter at least one row with a category and an amount.");
    if (!(total > 0)) return setError("Total expense must be greater than 0.");

    setSaving(true);
    try {
      const payload = {
        type: "E",
        category: "Daily",
        amount: -Math.abs(total),
        ledger_datetime: date,
        comment: buildDailyComment(rows),
      };
      if (ledgerId) await crud("ledger", "update", { id: ledgerId, entry_id: ledgerId, ...payload });
      else await crud("ledger", "insert", payload);

      clearCache(`ledger_${date.slice(0, 7)}`);
      navigate({ to: "/ledger" });
    } catch (err) {
      setError(err.message || "Submit failed.");
      setSaving(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Daily Expenses"
        subtitle={ledgerId ? "Editing existing entry" : "New entry"}
        back="/ledger"
        actions={<DateInput value={date} onChange={(e) => setDate(e.target.value)} />}
      />

      <StatGrid cols="grid-cols-2">
        <Stat label="Items" value={cleanRows(rows).length} />
        <Stat label="Day total" value={dollars(total)} tone="neg" highlight />
      </StatGrid>

      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Card>
          <Spinner />
        </Card>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Card>
            <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-surface px-2.5 py-2">
              <h2 className="truncate text-[13px] font-bold sm:text-sm">Breakdown</h2>
              <Button type="button" onClick={addRow}>
                <Plus size={13} /> Row
              </Button>
            </header>

            <ul className="divide-y divide-border">
              {rows.map((row, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[minmax(0,1fr)_88px_auto] items-center gap-1.5 px-2 py-1.5 sm:grid-cols-[160px_110px_minmax(0,1fr)_auto]"
                >
                  <input
                    className={inputClass}
                    value={row.category}
                    onChange={(e) => updateRow(i, { category: e.target.value })}
                    placeholder="Category"
                  />
                  <input
                    className={`${inputClass} num text-right`}
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => updateRow(i, { amount: e.target.value })}
                    placeholder="0"
                  />
                  <input
                    className={`${inputClass} col-span-2 sm:col-span-1`}
                    value={row.notes}
                    onChange={(e) => updateRow(i, { notes: e.target.value })}
                    placeholder="Notes (optional)"
                  />
                  <IconButton
                    label="Remove row"
                    tone="danger"
                    type="button"
                    className="row-start-1 col-start-3 sm:row-start-auto sm:col-start-auto"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </li>
              ))}
            </ul>

            <footer className="flex items-center justify-between gap-2 border-t border-border bg-surface px-2.5 py-2">
              <span className="text-[11px] font-semibold text-muted-foreground">Total</span>
              <span className="num text-sm font-extrabold text-neg">{dollars(total)}</span>
            </footer>
          </Card>

          <Card className="p-2.5">
            <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
              Saved to ledger comment as
            </p>
            <pre className="scroll-x rounded-md bg-surface p-2 font-mono text-[11px] leading-snug whitespace-pre">
              {preview}
            </pre>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => navigate({ to: "/ledger" })}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : ledgerId ? "Update day" : "Save day"}
            </Button>
          </div>
        </form>
      )}
    </Page>
  );
}
