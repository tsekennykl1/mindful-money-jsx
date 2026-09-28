import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown } from "lucide-react";

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

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Stock Transactions | Personal Finance" },
      { name: "description", content: "Record, edit and review monthly stock buy and sell transactions." },
      { property: "og:title", content: "Stock Transactions | Personal Finance" },
      { property: "og:description", content: "Record, edit and review monthly stock buy and sell transactions." },
    ],
  }),
  component: TransactionsPage,
});

const EMPTY = {
  symbol: "",
  market: ".HK",
  type: "BUY",
  quantity: "",
  price: "",
  notes: "",
  transaction_date: "",
};

function TransactionsPage() {
  const [month, setMonth] = useState(currentYearMonth);
  const cacheKey = `transactions_${month}`;

  const { data, loading, error, reload, setError } = useAsyncData(
    async (signal) => {
      const json = await crud("transaction", "get", { year_month: month }, { signal });
      return json.data || [];
    },
    [month],
    { cacheKey, initial: [] }
  );

  const rows = data || [];

  const [modal, setModal] = useState(null); // null | "add" | "edit"
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const openAdd = () => {
    setForm({ ...EMPTY, transaction_date: todayISO() });
    setEditingId(null);
    setFormError("");
    setModal("add");
  };

  const openEdit = (row) => {
    const id = row.id || row.transaction_id;
    if (!id) return setError("Cannot edit: this row has no ID.");
    const symbol = row.symbol || "";
    const isHK = symbol.toUpperCase().endsWith(".HK");
    setForm({
      symbol: isHK ? symbol.slice(0, -3) : symbol,
      market: isHK ? ".HK" : "",
      type: row.type || "BUY",
      quantity: String(row.quantity ?? ""),
      price: String(row.price ?? ""),
      notes: row.notes || "",
      transaction_date: toISODate(row.transaction_date || row.date) || todayISO(),
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
        await crud("transaction", "insert", {
          symbol,
          type: form.type,
          quantity: parseFloat(form.quantity),
          price: parseFloat(form.price),
          notes: form.notes || undefined,
          transaction_date: form.transaction_date || undefined,
        });
      } else {
        await crud("transaction", "update", {
          transaction_id: editingId,
          type: form.type || undefined,
          quantity: form.quantity ? parseFloat(form.quantity) : undefined,
          price: form.price ? parseFloat(form.price) : undefined,
          notes: form.notes || undefined,
          transaction_date: form.transaction_date || undefined,
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
      await crud("transaction", "delete", { transaction_id: id });
      clearCache(cacheKey);
      reload();
    } catch (err) {
      setError(`Delete failed: ${err.message}`);
    }
  };

  const { buys, sells, buyTotal, sellTotal, sorted } = useMemo(() => {
    const buys = rows.filter((r) => r.type === "BUY");
    const sells = rows.filter((r) => r.type === "SELL");
    const sum = (list) => list.reduce((s, r) => s + num(r.total_amount), 0);
    return {
      buys,
      sells,
      buyTotal: sum(buys),
      sellTotal: sum(sells),
      sorted: [...rows].sort((a, b) =>
        String(a.transaction_date || "").localeCompare(String(b.transaction_date || ""))
      ),
    };
  }, [rows]);

  return (
    <Page>
      <PageHeader
        title="Transactions"
        back="/"
        badges={
          <>
            <Pill tone="onDark">{rows.length} records</Pill>
            <Pill tone="pos">{buys.length} buys</Pill>
            <Pill tone="neg">{sells.length} sells</Pill>
          </>
        }
        actions={<MonthInput value={month} onChange={(e) => setMonth(e.target.value)} />}
      />

      <StatGrid cols="grid-cols-2">
        <Stat label="Total Buy" value={dollars(buyTotal)} tone="pos" hint={`${buys.length} orders`} />
        <Stat label="Total Sell" value={dollars(sellTotal)} tone="neg" hint={`${sells.length} orders`} />
      </StatGrid>

      <ErrorNote>{error}</ErrorNote>

      <Card>
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-surface px-2.5 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-bold sm:text-sm">Transaction History</h2>
            <p className="text-[11px] text-muted-foreground">{month}</p>
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
            rowKey={(r) => r.id}
            empty={`No transactions for ${month}`}
            columns={[
              { key: "symbol", header: "Stock", sticky: true, cell: (r) => r.symbol },
              {
                key: "name",
                header: "Name",
                priority: 3,
                cell: (r) => (
                  <span className="block max-w-[180px] truncate text-muted-foreground">
                    {r.stock_name || "—"}
                  </span>
                ),
              },
              {
                key: "date",
                header: "Date",
                cell: (r) => <span className="num">{(r.transaction_date || "—").slice(0, 10)}</span>,
              },
              {
                key: "type",
                header: "Type",
                align: "center",
                cell: (r) => (
                  <Pill tone={r.type === "BUY" ? "pos" : "neg"}>
                    {r.type === "BUY" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {r.type}
                  </Pill>
                ),
              },
              { key: "qty", header: "Qty", align: "right", cell: (r) => <span className="num">{integer(r.quantity)}</span> },
              { key: "price", header: "Price", align: "right", cell: (r) => <span className="num">{decimal(r.price)}</span> },
              {
                key: "total",
                header: "Total",
                align: "right",
                cell: (r) => <span className="num font-bold">{dollars(r.total_amount)}</span>,
              },
              {
                key: "notes",
                header: "Notes",
                priority: 3,
                cell: (r) => (
                  <span className="block max-w-[200px] truncate text-muted-foreground">{r.notes || "—"}</span>
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
                    <IconButton label="Delete" tone="danger" onClick={() => setConfirmId(r.id)}>
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
        title={modal === "add" ? "Add Transaction" : "Edit Transaction"}
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

          <div className="grid grid-cols-3 gap-3">
            <Field label="Type">
              <select className={inputClass} value={form.type} onChange={(e) => set("type", e.target.value)}>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
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
            <Field label="Price">
              <input
                className={inputClass}
                type="number"
                step="0.001"
                required
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Date">
            <input
              className={inputClass}
              type="date"
              value={form.transaction_date}
              onChange={(e) => set("transaction_date", e.target.value)}
            />
          </Field>

          <Field label="Notes">
            <input className={inputClass} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

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
        message="Delete this transaction?"
      />
    </Page>
  );
}
