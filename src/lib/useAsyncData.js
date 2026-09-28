import { useCallback, useEffect, useRef, useState } from "react";
import { readCache, writeCache, clearCache } from "./api";

/**
 * The one data-loading hook in the app.
 *
 *   const { data, loading, error, reload } = useAsyncData(
 *     (signal) => crud("ledger", "get", { month_str: ym }, { signal }),
 *     [ym],
 *     { cacheKey: `ledger_${ym}`, initial: [] }
 *   );
 *
 * - aborts in-flight requests when deps change or the page unmounts
 * - optional sessionStorage cache, skipped when reload() is called
 */
export function useAsyncData(loader, deps = [], options = {}) {
  const { cacheKey, initial = null } = options;

  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(
    async (signal, { fresh = false } = {}) => {
      if (cacheKey && !fresh) {
        const cached = readCache(cacheKey);
        if (cached !== null) {
          setData(cached);
          setLoading(false);
          setError("");
          return;
        }
      }
      setLoading(true);
      setError("");
      try {
        const result = await loaderRef.current(signal);
        if (signal?.aborted) return;
        setData(result);
        if (cacheKey) writeCache(cacheKey, result);
      } catch (err) {
        if (err?.name === "AbortError" || signal?.aborted) return;
        setError(err?.message || "Request failed");
        setData(initial);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheKey]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    run(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => {
    if (cacheKey) clearCache(cacheKey);
    return run(undefined, { fresh: true });
  }, [cacheKey, run]);

  return { data, loading, error, reload, setError };
}
