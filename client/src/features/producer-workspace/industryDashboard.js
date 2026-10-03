import api from "../../services/api";

export const INDUSTRY_DASHBOARD_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
});

export const INDUSTRY_DASHBOARD_SECTIONS = Object.freeze([
  "overview", "deals", "matches", "finance", "market",
]);

const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

export function readIndustryDashboardQuery(search = "") {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const section = String(params.get("section") || "").trim().toLowerCase();
  return { section: INDUSTRY_DASHBOARD_SECTIONS.includes(section) ? section : "overview" };
}

export function writeIndustryDashboardQuery(current = "", patch = {}) {
  const params = current instanceof URLSearchParams
    ? new URLSearchParams(current)
    : new URLSearchParams(current);
  const next = { ...readIndustryDashboardQuery(params), ...patch };
  if (next.section && next.section !== "overview") params.set("section", next.section);
  else params.delete("section");
  return params;
}

export function normalizeIndustryDashboardPayload({ dash, wallet, transactions, requests, watchlist, consultations } = {}) {
  const transactionRows = transactions?.transactions ?? transactions;
  return {
    dash: dash || null,
    wallet: wallet || null,
    transactions: list(transactionRows),
    purchaseRequests: list(requests),
    watchlist: list(watchlist),
    consultations: list(consultations),
  };
}

const messageFor = (cause) => cause?.response?.data?.message || "We couldn't load your industry dashboard just now.";

export async function loadIndustryDashboard({ signal, professional = true } = {}) {
  const legs = [
    ["dash", () => api.get("/dashboard/investor", { signal })],
    ...(professional ? [
      ["wallet", () => api.get("/transactions/wallet/balance", { signal })],
      ["transactions", () => api.get("/transactions", { signal, params: { limit: 6 } })],
      ["requests", () => api.get("/scripts/purchase-requests/mine", { signal, params: { limit: 12 } })],
      ["watchlist", () => api.get("/users/watchlist", { signal, params: { limit: 8 } })],
      ["consultations", () => api.get("/consultations/professional", { signal })],
    ] : []),
  ];
  const names = legs.map(([name]) => name);
  const settled = await Promise.allSettled(legs.map(([, request]) => request()));

  if (signal?.aborted) return { ok: false, cancelled: true };

  const failures = {};
  const payload = {};
  settled.forEach((result, index) => {
    const key = names[index];
    if (result.status === "fulfilled") payload[key] = result.value.data;
    else failures[key] = messageFor(result.reason);
  });

  if (Object.keys(failures).length === names.length) {
    return { ok: false, message: failures.dash || Object.values(failures)[0], failures };
  }

  return {
    ok: true,
    data: {
      ...normalizeIndustryDashboardPayload(payload),
      failures,
      syncedAt: new Date(),
    },
  };
}
