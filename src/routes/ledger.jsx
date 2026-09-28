import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  DateInput,
  Modal,
  ConfirmDelete,
  Field,
  inputClass,
} from "../components/Ui";
import { currentYearMonth, dollars, num, tone, toISODate, todayISO } from "../lib/format";

export const Route = createFileRoute("/ledger")({
  head: () => ({
    meta: [
      { title: "Cash Ledger | Personal Finance" },
      { name: "description", content: "Monthly income and expense ledger with categories, notes and net totals." },
      { property: "og:title", content: "Cash Ledger | Personal Finance" },
      { property: "og:description", content: "Monthly income and expense ledger with categories, notes and net totals." },
    ],
  }),
  component: LedgerPage,
});

const EMPTY = { type: "E", category: "", amount: "", ledger_datetime: "", comment: "" };

/** Rows come back with `datetime`, `ledger_datetime` or `date` depending on source. */
function rowDate(row) {
  return toISODate(row?.datetime || row?.ledger_datetime || row?.date) || "";
}

/** Expenses are always stored negative, income always positive. */
function signedAmount(type, amount) {
  const n = Math.abs(num(amount));
  return type === "E" ? -n : n;
}

function LedgerPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentYearMonth);
  const [dailyDate, setDailyDate] = useState(todayISO);
  const cacheKey = `ledger_${month}`;

  const { data, loading, error, reload, setError } = useAsyncData(
    async (signal) => {
      const json = await crud("ledger", "get", { month_str: month }, { signal });
      return json.data || [];
    },
    [month],
    { cacheKey, initial: [] }
  );

  const rows = data || [];

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const openAdd = () => {
    setForm({ ...EMPTY, ledger_datetime: todayISO() });
    setEditingId(null);
    setFormError("");
    setModal("add");
  };

  const openEdit = (row) => {
    if (typeof row?.id !== "number") return setError("Cannot edit: this row has no numeric ID.");
    setForm({
      type: row.type || "E",
      category: row.category || "",
      amount: String(row.amount ?? ""),
      ledger_datetime: rowDate(row) || todayISO(),
      comment: row.comment || "",
    });
    setEditingId(row.id);
    setFormError("");
    setModal("edit");
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const base = {
        type: form.type,
        category: form.category,
        amount: form.amount === "" ? undefined : signedAmount(form.type, form.amount),
        ledger_datetime: form.ledger_datetime || undefined,
        comment: form.comment || undefined,
      };
      if (modal === "add") await crud("ledger", "insert", base);
      else await crud("ledger", "update", { id: editingId, ...base });

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
      await crud("ledger", "delete", { id });
      clearCache(cacheKey);
      reload();
    } catch (err) {
      setError(`Delete failed: ${err.message}`);
    }
  };

  const { income, expenses, net, sorted } = useMemo(() => {
    const income = rows.filter((r) => r.type === "I").reduce((s, r) => s + num(r.amount), 0);
    const expenses = rows.filter((r) => r.type === "E").reduce((s, r) => s + num(r.amount), 0);
    return {
      income,
      expenses,
      net: income + expenses,
      sorted: [...rows].sort((a, b) => rowDate(a).localeCompare(rowDate(b))),
    };
  }, [rows]);

  // Jump to the daily-expense sheet, pre-loading that day's "Daily" row if one exists.
  const openDaily = () => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dailyDate) ? dailyDate : todayISO();
    const existing = rows.find(
      (r) => r?.type === "E" && r?.category === "Daily" && rowDate(r) === date
    );
    navigate({
      to: "/daily-expense",
      search: typeof existing?.id === "number" ? { date, ledger_id: existing.id } : { date },
    });
  };

  return (
    <Page>
      <PageHeader
        title="Ledger"
        back="/"
        badges={<Pill tone="onDark">{rows.length} entries</Pill>}
        actions={<MonthInput value={month} onChange={(e) => setMonth(e.target.value)} />}
      />

      <StatGrid cols="grid-cols-3">
        <Stat label="Income" value={dollars(income)} tone="pos" />
        <Stat label="Expenses" value={dollars(expenses)} tone="neg" />
        <Stat label="Net" value={dollars(net)} tone={tone(net)} highlight />
      </StatGrid>

      <ErrorNote>{error}</ErrorNote>

      <Card>
        <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[13px] font-bold sm:text-sm">Ledger Entries</h2>
            <p className="text-[11px] text-muted-foreground">{month}</p>
          </div>
          <DateInput
            value={dailyDate}
            onChange={(e) => setDailyDate(e.target.value)}
            aria-label="Daily expense date"
          />
          <Button type="button" onClick={openDaily}>
            Daily sheet
          </Button>
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
            empty={`No ledger entries for ${month}`}
            columns={[
              {
                key: "date",
                header: "Date",
                sticky: true,
                cell: (r) => <span className="num">{rowDate(r) || "—"}</span>,
              },
              {
                key: "type",
                header: "Type",
                align: "center",
                cell: (r) => (
                  <Pill tone={r.type === "I" ? "pos" : "neg"}>{r.type === "I" ? "In" : "Out"}</Pill>
                ),
              },
              { key: "category", header: "Category", cell: (r) => r.category || "—" },
              {
                key: "amount",
                header: "Amount",
                align: "right",
                cell: (r) => (
                  <span className={`num font-bold ${r.type === "I" ? "text-pos" : "text-neg"}`}>
                    {dollars(r.amount)}
                  </span>
                ),
              },
              {
                key: "comment",
                header: "Comment",
                priority: 2,
                cell: (r) => (
                  <span className="block max-w-[260px] truncate text-muted-foreground">
                    {r.comment || "—"}
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
        title={modal === "add" ? "Add Entry" : "Edit Entry"}
      >
        <form onSubmit={save} className="flex flex-col gap-3">
          <ErrorNote>{formError}</ErrorNote>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className={inputClass} value={form.type} onChange={(e) => set("type", e.target.value)}>
                <option value="E">Expense</option>
                <option value="I">Income</option>
              </select>
            </Field>
            <Field label="Date">
              <input
                className={inputClass}
                type="date"
                value={form.ledger_datetime}
                onChange={(e) => set("ledger_datetime", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input
                className={inputClass}
                required
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="e.g. Daily, Salary"
              />
            </Field>
            <Field label="Amount" hint="Sign is applied automatically">
              <input
                className={inputClass}
                type="number"
                step="1"
                required
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Comment">
            <input className={inputClass} value={form.comment} onChange={(e) => set("comment", e.target.value)} />
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
        message="Delete this ledger entry?"
      />
    </Page>
  );
}
