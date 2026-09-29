// Single API layer: endpoints, auth-aware fetch, the generic CRUD call and the
// short-lived session cache. Every page talks to the backend through here.

import { getAccessToken } from "./auth-token";

export const API_BASE_JAVA = "https://7298nhfyc0.execute-api.ap-east-1.amazonaws.com/Prod";

export const ENDPOINTS = {
  REPORT_CURRENT: `${API_BASE_JAVA}/api/v1/reports`,
  REPORT: (yearMonth) => `${API_BASE_JAVA}/api/v1/reports/${yearMonth}`,
  STOCK: "/api/stocks",
  CRUD: "/api/crud",
};

/** fetch() with the Cognito bearer token attached when auth is on. */
export async function authFetch(url, options = {}) {
  const headers = { ...options.headers };
  const token = await getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return fetch(url, { ...options, headers });
}

/**
 * The Python lambda speaks one shape for every resource:
 * { resource_name, action, payload } -> { data } | { error }.
 * Throws an Error with the server message on failure.
 */
export async function crud(resource_name, action, payload = {}, options = {}) {
  const res = await authFetch(ENDPOINTS.CRUD, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({ resource_name, action, payload }),
  });

  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }

  if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}: ${text}`);
  if (json.error) throw new Error(json.error);
  return json;
}

// ── Session cache (2 minutes, survives page navigation) ──

export const CACHE_TTL = 2 * 60 * 1000;

export function readCache(key) {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, expiry } = JSON.parse(raw);
    if (Date.now() > expiry) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function writeCache(key, data, ttl = CACHE_TTL) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + ttl }));
  } catch {
    /* quota or private mode — caching is optional */
  }
}

export function clearCache(key) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
