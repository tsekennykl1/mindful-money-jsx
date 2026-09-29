import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { crud, clearCache } from "../lib/api";
import { useAsyncData } from "../lib/useAsyncData";
import {
  Page,
  PageHeader,
  Card,
  StatGrid,
  Stat,
  DataTable,
  Pill,
  Spinner,
  ErrorNote,
  Button,
  IconButton,
  MonthInput,
  Modal,
  ConfirmDelete,
  Field,
  inputClass,
} from "../components/Ui";
import {
  currentYearMonth,
  dollars,
  decimal,
  integer,
  num,
  toISODate,
  todayISO,
  normalizeHKSymbol,
} from "../lib/format";

export const Route = createFileRoute("/dividends")({
  head: () => ({
    meta: [
      { title: "Dividend Records | Personal Finance" },
      { name: "description", content: "Track dividend payments per stock, per month, with running totals." },
      { property: "og:title", content: "Dividend Records | Personal Finance" },
      { property: "og:description", content: "Track dividend payments per stock, per month, with running totals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DividendsPage,
});

const EMPTY = {
  symbol: "",
  market: ".HK",
  amount_per_share: "",
  quantity: "",
  payment_date: "",
  ex_dividend_date: "",
};

/** The lambda has returned three different shapes over time — normalise them all. */
function readDividends(json, month) {
  if (Array.isArray(json.data)) {
    const rows = json.data;
    const amount = (r) => num(r.total_dividend || r.dividend_amount);
    return {
      rows,
      monthTotal: rows.filter((r) => r.payment_month_str === month).reduce((s, r) => s + amount(r), 0),
      allTotal: rows.reduce((s, r) => s + amount(r), 0),
    };
  }
  const src = json.data?.dividends ? json.data : json.dividends ? json : null;
  if (!src) return { rows: [], monthTotal: 0, allTotal: 0 };
  return {
    rows: src.dividends || [],
    monthTotal: src.total_dividend || 0,
    allTotal: src.total_all_dividend || 0,
  };
}

function DividendsPage() {
  const [month, setMonth] = useState(currentYearMonth);
  const cacheKey = `dividends_${month}`;

  const { data, loading, error, reload, setError } = useAsyncData(
    async (signal) => {
      const json = await crud("dividend", "get_all", { year_month: month }, { signal });
      return readDividends(json, month);
    },
    [month],
    { cacheKey, initial: { rows: [], monthTotal: 0, allTotal: 0 } }
  );

  const { rows, monthTotal, allTotal } = data || { rows: [], monthTotal: 0, allTotal: 0 };

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const openAdd = () => {
    setForm({ ...EMPTY, payment_date: `${month}-01` });
    setEditingId(null);
    setFormError("");
    setModal("add");
  };

  const openEdit = (row) => {
    const id = row.id || row.dividend_id;
    if (!id) return setError("Cannot edit: this row has no ID.");
    const symbol = row.symbol || "";
    const isHK = symbol.toUpperCase().endsWith(".HK");
    setForm({
      symbol: isHK ? symbol.slice(0, -3) : symbol,
      market: isHK ? ".HK" : "",
      amount_per_share: String(row.amount_per_share ?? ""),
      quantity: String(row.quantity ?? ""),
      payment_date: toISODate(row.payment_date || row.date) || todayISO(),
      ex_dividend_date: toISODate(row.ex_dividend_date),
    });
    setEditingId(id);
    setFormError("");
    setModal("edit");
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (modal === "add") {
        let symbol = form.symbol.toUpperCase().trim();
        if (form.market === ".HK") {
          const check = normalizeHKSymbol(symbol);
          if (check.error) throw new Error(check.error);
          symbol = `${check.symbol}.HK`;
        }
        await crud("dividend", "insert", {
          symbol,
          amount_per_share: parseFloat(form.amount_per_share),
          quantity: parseFloat(form.quantity),
          payment_date: form.payment_date || undefined,
          ex_dividend_date: form.ex_dividend_date || undefined,
        });
      } else {
        await crud("dividend", "update", {
          dividend_id: editingId,
          amount_per_share: form.amount_per_share ? parseFloat(form.amount_per_share) : undefined,
          quantity: form.quantity ? parseFloat(form.quantity) : undefined,
          payment_date: form.payment_date || undefined,
          ex_dividend_date: form.ex_dividend_date || undefined,
        });
      }
      setModal(null);
      clearCache(cacheKey);
      reload();
    } catch (err) {
      setFormError(err.message);
    }
    setSaving(false);
  };

  const remove = async (id) => {
    setConfirmId(null);
    try {
      await crud("dividend", "delete", { dividend_id: id });
      clearCache(cacheKey);
      reload();
    } catch (err) {
      setError(`Delete failed: ${err.message}`);
    }
  };

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => String(b.payment_date || "").localeCompare(String(a.payment_date || ""))),
    [rows]
  );

  return (
    <Page>
      <PageHeader
        title="Dividends"
        back="/"
        badges={<Pill tone="onDark">{rows.length} records</Pill>}
        actions={<MonthInput value={month} onChange={(e) => setMonth(e.target.value)} />}
      />

      <StatGrid cols="grid-cols-2">
        <Stat label={`Total ${month}`} value={dollars(monthTotal)} tone="pos" />
        <Stat label="All-time total" value={dollars(allTotal)} tone="pos" />
      </StatGrid>

      <ErrorNote>{error}</ErrorNote>

      <Card>
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-surface px-2.5 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-bold sm:text-sm">Dividend Records</h2>
            <p className="text-[11px] text-muted-foreground">From {month}</p>
          </div>
          <Button variant="primary" type="button" onClick={openAdd}>
            <Plus size={13} /> Add
          </Button>
        </header>

        {loading ? (
          <Spinner />
        ) : (
          <DataTable
            rows={sorted}
            rowKey={(r, i) => r.id || `${r.symbol}-${r.payment_date}-${i}`}
            empty={`No dividend records from ${month}`}
            columns={[
              { key: "symbol", header: "Code", sticky: true, cell: (r) => r.symbol },
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
              {
                key: "month",
                header: "Month",
                priority: 2,
                cell: (r) => <span className="num">{r.payment_month_str || "—"}</span>,
              },
              {
                key: "paid",
                header: "Paid",
                cell: (r) => <span className="num">{(r.payment_date || "—").slice(0, 10)}</span>,
              },
              {
                key: "ex",
                header: "Ex-Div",
                priority: 2,
                cell: (r) => <span className="num">{(r.ex_dividend_date || "—").slice(0, 10)}</span>,
              },
              {
                key: "aps",
                header: "@Share",
                align: "right",
                cell: (r) => <span className="num">{decimal(r.amount_per_share, 4)}</span>,
              },
              { key: "qty", header: "Qty", align: "right", cell: (r) => <span className="num">{integer(r.quantity)}</span> },
              {
                key: "amount",
                header: "Amount",
                align: "right",
                cell: (r) => (
                  <span className="num font-bold text-pos">
                    {dollars(r.total_dividend ?? r.dividend_amount)}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "",
                align: "center",
                cell: (r) => (
                  <div className="flex justify-center gap-1">
                    <IconButton label="Edit" onClick={() => openEdit(r)}>
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton
                      label="Delete"
                      tone="danger"
                      onClick={() => setConfirmId(r.id || r.dividend_id)}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "add" ? "Add Dividend" : "Edit Dividend"}
      >
        <form onSubmit={save} className="flex flex-col gap-3">
          <ErrorNote>{formError}</ErrorNote>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Symbol"
              hint={
                modal === "add" && form.market === ".HK" && form.symbol.trim()
                  ? `Submits as ${form.symbol.trim().padStart(4, "0")}.HK`
                  : undefined
              }
            >
              <input
                className={inputClass}
                required={modal === "add"}
                disabled={modal === "edit"}
                value={form.symbol}
                onChange={(e) => set("symbol", e.target.value)}
                placeholder={form.market === ".HK" ? "700" : "AAPL"}
              />
            </Field>
            <Field label="Market">
              <select
                className={inputClass}
                disabled={modal === "edit"}
                value={form.market}
                onChange={(e) => set("market", e.target.value)}
              >
                <option value=".HK">Hong Kong (.HK)</option>
                <option value="">US / Other</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Dividend per share">
              <input
                className={inputClass}
                type="number"
                step="0.0001"
                required
                value={form.amount_per_share}
                onChange={(e) => set("amount_per_share", e.target.value)}
              />
            </Field>
            <Field label="Quantity">
              <input
                className={inputClass}
                type="number"
                step="1"
                required
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment date">
              <input
                className={inputClass}
                type="date"
                value={form.payment_date}
                onChange={(e) => set("payment_date", e.target.value)}
              />
            </Field>
            <Field label="Ex-dividend date">
              <input
                className={inputClass}
                type="date"
                value={form.ex_dividend_date}
                onChange={(e) => set("ex_dividend_date", e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDelete
        open={confirmId !== null}
        onCancel={() => setConfirmId(null)}
        onConfirm={() => remove(confirmId)}
        message="Delete this dividend record?"
      />
    </Page>
  );
}
