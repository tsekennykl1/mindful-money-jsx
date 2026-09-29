// Shared building blocks. Everything here is tuned for iPhone portrait first:
// small type, tight padding, tabular numbers, and tables that stay tables.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ArrowLeft, Loader2 } from "lucide-react";

const cx = (...parts) => parts.filter(Boolean).join(" ");

/* ── Page frame ───────────────────────────────────────── */

export function Page({ children }) {
  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="mx-auto w-full max-w-7xl px-2 py-3 sm:px-4 sm:py-5">
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, badges, actions, back }) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg bg-header px-3 py-2.5 text-header-foreground sm:px-4 sm:py-3">
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold tracking-tight sm:text-xl">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[11px] opacity-70 sm:text-xs">{subtitle}</p>
        ) : null}
        {badges ? <div className="mt-1.5 flex flex-wrap gap-1">{badges}</div> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {actions}
        {back ? (
          <Link
            to={back}
            aria-label="Back"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-header-foreground/10 transition-colors hover:bg-header-foreground/20"
          >
            <ArrowLeft size={15} />
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/* ── Pills & badges ───────────────────────────────────── */

const pillTones = {
  neutral: "bg-muted text-muted-foreground",
  pos: "bg-pos-soft text-pos",
  neg: "bg-neg-soft text-neg",
  info: "bg-info-soft text-info",
  warn: "bg-warn-soft text-warn",
  onDark: "bg-header-foreground/15 text-header-foreground",
};

export function Pill({ tone = "neutral", children, className }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap sm:text-xs",
        pillTones[tone] || pillTones.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}

/* ── Card / collapsible section ───────────────────────── */

export function Card({ children, className }) {
  return (
    <section
      className={cx("overflow-hidden rounded-lg border border-border bg-card shadow-sm", className)}
    >
      {children}
    </section>
  );
}

export function Section({ title, subtitle, badge, right, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-surface px-2.5 py-2 sm:px-3.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1.5 text-left"
        >
          <ChevronDown
            size={15}
            className={cx(
              "shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90"
            )}
          />
          <span className="truncate text-[13px] font-bold sm:text-sm">{title}</span>
          {subtitle ? (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {subtitle}
            </span>
          ) : null}
          {badge}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">{right}</div>
      </header>
      {open ? <div>{children}</div> : null}
    </Card>
  );
}

/* ── KPI stats ────────────────────────────────────────── */

export function StatGrid({ children, cols = "grid-cols-2 sm:grid-cols-4" }) {
  return <div className={cx("grid gap-px bg-border", cols)}>{children}</div>;
}

export function Stat({ label, value, tone = "flat", hint, highlight }) {
  const color = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-foreground";
  return (
    <div className={cx("bg-card px-2.5 py-2", highlight && "bg-info-soft")}>
      <div className="truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase sm:text-[11px]">
        {label}
      </div>
      <div className={cx("num text-sm font-bold sm:text-lg", color)}>{value}</div>
      {hint ? <div className="truncate text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/* ── Dense responsive table ───────────────────────────── */

/**
 * columns: [{ key, header, align, cell(row, i), sticky }]
 * All fields stay available. The table fits as many columns as possible, then
 * scrolls horizontally instead of hiding data on narrow screens.
 */
export function DataTable({ columns, rows, rowKey, empty = "No data", footer }) {
  if (!rows || rows.length === 0) {
    return <div className="px-3 py-8 text-center text-xs text-muted-foreground">{empty}</div>;
  }

  const alignOf = (a) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  return (
    <div className="scroll-x">
      <table className="w-max min-w-full border-collapse text-[11px] sm:text-[13px]">
        <thead>
          <tr className="bg-surface text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cx(
                  "border-b border-border px-1.5 py-1.5 font-semibold whitespace-nowrap sm:px-2.5",
                  alignOf(c.align),
                  c.sticky && "sticky left-0 z-10 bg-surface"
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row, i) : i} className="even:bg-surface/60">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cx(
                    "border-b border-border px-1.5 py-1.5 whitespace-nowrap sm:px-2.5",
                    alignOf(c.align),
                    c.sticky && "sticky left-0 z-10 bg-card font-semibold"
                  )}
                >
                  {c.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}

/* ── Feedback ─────────────────────────────────────────── */

export function Spinner({ size = 24 }) {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 size={size} className="spin-slow text-primary" />
    </div>
  );
}

export function ErrorNote({ tone = "neg", children }) {
  if (!children) return null;
  const tones = {
    neg: "border-neg/30 bg-neg-soft text-neg",
    warn: "border-warn/30 bg-warn-soft text-warn",
  };
  return (
    <div className={cx("rounded-md border px-3 py-2 text-xs", tones[tone] || tones.neg)}>
      {children}
    </div>
  );
}

/* ── Controls ─────────────────────────────────────────── */

export function Button({ variant = "default", size = "md", className, ...props }) {
  const variants = {
    default: "bg-secondary text-secondary-foreground hover:bg-accent",
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    ghost: "bg-transparent text-foreground hover:bg-accent",
    onDark: "bg-header-foreground/10 text-header-foreground hover:bg-header-foreground/20",
    danger: "bg-neg-soft text-neg hover:bg-neg/20",
  };
  const sizes = {
    sm: "h-7 px-2 text-[11px]",
    md: "h-8 px-2.5 text-xs",
  };
  return (
    <button
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1 rounded-md font-semibold transition-colors disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function IconButton({ label, tone = "default", className, ...props }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx(
        "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border transition-colors",
        tone === "danger"
          ? "text-neg hover:bg-neg-soft"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

export function MonthInput(props) {
  return (
    <input
      type="month"
      className="h-8 rounded-md border border-input bg-card px-2 text-xs font-semibold text-foreground"
      {...props}
    />
  );
}

export function DateInput(props) {
  return (
    <input
      type="date"
      className="h-8 rounded-md border border-input bg-card px-2 text-xs font-semibold text-foreground"
      {...props}
    />
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground";

/* ── Modal ────────────────────────────────────────────── */

export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-border bg-card shadow-xl sm:max-w-lg sm:rounded-xl">
        <header className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-3 py-2.5">
          <h2 className="text-sm font-bold">{title}</h2>
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Close
          </Button>
        </header>
        <div className="p-3">{children}</div>
        {footer ? <div className="border-t border-border p-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDelete({ open, onCancel, onConfirm, message }) {
  return (
    <Modal open={open} onClose={onCancel} title="Confirm delete">
      <p className="text-sm text-muted-foreground">{message || "This cannot be undone."}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" type="button" onClick={onConfirm}>
          Delete
        </Button>
      </div>
    </Modal>
  );
}
