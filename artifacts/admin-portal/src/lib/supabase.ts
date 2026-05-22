import type { AdminApp, Device, AppStats } from "./types";

// All calls go through our Express backend — no Supabase key on frontend
const API = "/api/admin";

const PAT_KEY = "supabase_pat";

export function savePat(pat: string) {
  localStorage.setItem(PAT_KEY, pat);
}

export function getPat(): string {
  return localStorage.getItem(PAT_KEY) ?? "";
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

// ─── Setup ────────────────────────────────────────────────

export async function checkSetupDone(): Promise<boolean> {
  try {
    const res = await apiFetch("/setup/status");
    if (!res.ok) return false;
    const data = (await res.json()) as { done: boolean };
    return data.done === true;
  } catch {
    return false;
  }
}

export async function runSetup(pat: string): Promise<void> {
  const res = await apiFetch("/setup/init", {
    method: "POST",
    body: JSON.stringify({ pat }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
    };
    throw new Error(body.error ?? `Setup failed (${res.status})`);
  }
}

// ─── Apps ─────────────────────────────────────────────────

export async function getApps(): Promise<AdminApp[]> {
  const res = await apiFetch("/apps");
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<AdminApp[]>;
}

export async function createApp(
  token: string,
  label: string,
  pat: string
): Promise<AdminApp> {
  const res = await apiFetch("/apps", {
    method: "POST",
    body: JSON.stringify({ token, label, pat }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
    };
    throw new Error(body.error ?? `Create failed (${res.status})`);
  }
  return res.json() as Promise<AdminApp>;
}

export async function updateApp(id: string, patch: Partial<AdminApp>): Promise<void> {
  const res = await apiFetch(`/apps/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function deleteApp(id: string): Promise<void> {
  const res = await apiFetch(`/apps/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

// ─── Devices ──────────────────────────────────────────────

export async function getDevices(appToken: string): Promise<Device[]> {
  const res = await apiFetch(`/apps/${appToken}/devices`);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const raw = (await res.json()) as Record<string, unknown>[];
  return raw.map((r) => ({
    ...r,
    data_json: (r["data_json"] as Device["data_json"]) ?? {},
  })) as Device[];
}

export async function blockDevice(appToken: string, uid: string): Promise<void> {
  const res = await apiFetch(`/apps/${appToken}/devices/${encodeURIComponent(uid)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "blocked" }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function unblockDevice(appToken: string, uid: string): Promise<void> {
  const res = await apiFetch(`/apps/${appToken}/devices/${encodeURIComponent(uid)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function deleteDevice(appToken: string, uid: string): Promise<void> {
  const res = await apiFetch(
    `/apps/${appToken}/devices/${encodeURIComponent(uid)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

// ─── Stats ────────────────────────────────────────────────

export function calcStats(devices: Device[]): AppStats {
  const now = Date.now();
  let online = 0, blocked = 0, smsTotal = 0;
  for (const d of devices) {
    if (d.status === "blocked") blocked++;
    const t = d.data_json?.online_checked_at ?? 0;
    if (t > 0 && now - t < 15 * 60 * 1000) online++;
    smsTotal += d.total_sms_count ?? 0;
  }
  return { total: devices.length, online, blocked, smsTotal };
}

// ─── Helpers ──────────────────────────────────────────────

export function genToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export function getConstantsKt(token: string): string {
  return `object Constants {
    const val SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co"
    const val SUPABASE_KEY = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx"
    const val REST_URL     = "\${SUPABASE_URL}/rest/v1"
    const val APP_ID       = "${token}"
    const val BASE_URL     = "\${REST_URL}/"
}`;
}

// kept for Settings page display only (not secret)
export const PROJECT_REF = "imfwqoocwfvvtjghgofi";
export const SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co";
export const SUPABASE_KEY = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx";
