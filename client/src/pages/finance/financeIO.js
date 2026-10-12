import { useCallback, useEffect, useState } from "react";
import api from "../../services/financeApi";

/**
 * The two ways a /finance tab talks to the server that the paged `useFinanceData` does not cover:
 * a one-shot read keyed by its parameters, and a server-generated CSV download.
 */

/**
 * GET `url` with `params`, re-fetching whenever either changes and on `reload()`.
 *
 * `loading` is DERIVED — true until the response for the current url+params+reload has landed — so
 * nothing calls setState synchronously inside the effect, and a response for a superseded month can
 * never be shown as the current one (it is both cancel-guarded and keyed). The previous `data` is
 * kept while a reload is in flight, so a refresh after an admin action does not blank the panel.
 */
export function useFinanceGet(url, params) {
  const paramsJson = JSON.stringify(params || {});
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState({ key: "", data: null, error: "" });
  const requestKey = url ? `${url}|${paramsJson}|${reloadToken}` : "";

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    const key = `${url}|${paramsJson}|${reloadToken}`;
    api.get(url, { params: JSON.parse(paramsJson) })
      .then(({ data }) => {
        if (!cancelled) setResult({ key, data: data ?? null, error: "" });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ key, data: null, error: err?.response?.data?.message || "Could not load this." });
        }
      });
    return () => { cancelled = true; };
  }, [url, paramsJson, reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);
  const settled = result.key === requestKey;

  return {
    data: result.data,
    loading: Boolean(url) && !settled,
    error: settled ? result.error : "",
    reload,
  };
}

/**
 * Download a CSV the SERVER generated. Anything filed with the government is exported this way, never
 * from DataTable's client export (which only knows the rendered columns). Goes through the
 * authenticated client because the endpoints sit behind `protect` — a plain link would 401.
 */
export async function downloadCsv(path, params, filename) {
  const { data } = await api.get(path, { params, responseType: "blob" });
  const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
