import { useState } from "react";
import { Sparkles } from "lucide-react";

import { authFetch } from "../lib/api";
import { Card, Button, inputClass } from "./Ui";

/**
 * Describe a transaction, get an AI-suggested category + spending label.
 * onApply({ category, label, description }) lets the page use the suggestion.
 */
export function AiSuggest({ onApply }) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const suggest = async (e) => {
    e.preventDefault();
    if (!description.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await authFetch("/api/categorize", {
        method: "POST",
        body: JSON.stringify({ description: description.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setResult(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-2.5">
      <form onSubmit={suggest} className="flex flex-col gap-2">
        <label className="flex items-center gap-1.5 text-[12px] font-bold">
          <Sparkles size={13} /> Suggest a category
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
          <input
            className={inputClass}
            value={description}
            maxLength={300}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Starbucks latte at airport"
          />
          <Button variant="primary" type="submit" disabled={loading || !description.trim()}>
            {loading ? "Thinking…" : "Suggest"}
          </Button>
        </div>
        {error && <p className="text-[11px] font-semibold text-neg">{error}</p>}
        {result && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface p-2">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">{result.category}</p>
              <p className="truncate text-sm font-bold">{result.label}</p>
            </div>
            {onApply && (
              <Button type="button" onClick={() => onApply({ ...result, description: description.trim() })}>
                Add row
              </Button>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}
