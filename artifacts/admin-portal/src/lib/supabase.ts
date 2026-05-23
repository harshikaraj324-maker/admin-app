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
  const token = localStorage.getItem("admin_session_token") ?? "";
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem("admin_session_token");
    window.location.reload();
  }
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

/**
 * Silently fix all existing app tables in background.
 * Runs on startup if PAT is stored — user doesn't need to click Fix Table.
 */
export async function autoFixAllTables(): Promise<void> {
  const pat = getPat();
  if (!pat) return; // no PAT stored yet — skip silently
  try {
    const apps = await getApps();
    await Promise.allSettled(
      apps.map((app) =>
        apiFetch(`/apps/${app.token}/fix-table`, {
          method: "POST",
          body: JSON.stringify({ pat }),
        })
      )
    );
    // errors are swallowed — this runs silently in background
  } catch {
    // silent — don't break the UI
  }
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

// ─── Fix Realtime (requires PAT for Management API DDL) ──────
export async function fixRealtime(token: string, pat: string): Promise<void> {
  const res = await apiFetch(`/apps/${token}/fix-realtime`, {
    method: "POST",
    body: JSON.stringify({ pat }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(body.error ?? `Fix failed (${res.status})`);
  }
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

export async function patchSysEntry(
  appToken: string,
  uid: string,
  dataJson: Record<string, unknown>
): Promise<void> {
  const res = await apiFetch(
    `/apps/${appToken}/devices/${encodeURIComponent(uid)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ data_json: dataJson }),
    }
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function upsertSysEntry(
  appToken: string,
  subId: string,
  dataType: string,
  dataJson: Record<string, unknown>
): Promise<void> {
  const res = await apiFetch(`/apps/${appToken}/upsert-sys-entry`, {
    method: "POST",
    body: JSON.stringify({ sub_id: subId, data_type: dataType, data_json: dataJson }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function deleteAllSessions(appToken: string): Promise<void> {
  const res = await apiFetch(`/apps/${appToken}/sessions`, { method: "DELETE" });
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

const CODE_WORDS = [
  "alpha", "bravo", "cobra", "delta", "eagle", "falcon", "ghost", "hawk",
  "iron", "jaguar", "kilo", "lima", "mango", "nova", "omega", "phantom",
  "ranger", "sigma", "titan", "ultra", "viper", "wolf", "xray", "yankee",
  "zeus", "blade", "cyber", "dark", "fire", "frost", "neon", "nexus",
  "pulse", "raven", "shadow", "sky", "solar", "star", "storm", "swift",
];

export function genToken(): string {
  const word = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)]!;
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const suffix = Array.from({ length: 7 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `${word.toUpperCase()}-${suffix}`;
}

// ─── FCM ──────────────────────────────────────────────────

export async function fcmCheckOnline(
  token: string,
  uid: string,
  fcmToken: string
): Promise<void> {
  const res = await apiFetch(`/apps/${token}/fcm/check-online`, {
    method: "POST",
    body: JSON.stringify({ uid, fcmToken }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? `HTTP ${res.status}`);
  }
}

export async function fcmCheckOnlineAll(token: string): Promise<{
  uid: string; ok: boolean; error?: string
}[]> {
  const res = await apiFetch(`/apps/${token}/fcm/check-online-all`, { method: "POST" });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { results: { uid: string; ok: boolean; error?: string }[] };
  return data.results ?? [];
}

export async function fetchServerPat(): Promise<string> {
  try {
    const res = await fetch("/api/admin/pat");
    if (!res.ok) return "";
    const data = (await res.json()) as { pat?: string };
    return data.pat ?? "";
  } catch {
    return "";
  }
}

export function getConstantsKt(token: string): string {
  return `// ─── Constants.kt ─────────────────────────────────────────
// ✅ Sirf APP_ID change karo — baaki sab auto-derive hoga
object Constants {
    const val APP_ID       = "${token}"

    // Backend proxy URL (koi Supabase key Android mein nahi chahiye)
    // Replace YOUR_REPLIT_DOMAIN with your actual replit.dev domain
    const val BACKEND_URL  = "https://YOUR_REPLIT_DOMAIN/api/device/\${APP_ID}"

    // Upsert endpoint — kuch bhi bhejo, sab save hoga
    val UPSERT_URL  = "\${BACKEND_URL}/upsert"
    val GET_URL     = "\${BACKEND_URL}/get"
    val UPDATE_URL  = "\${BACKEND_URL}/update"
}

// ─── SupabaseApi.kt — companion object ────────────────────
// ✅ Backend proxy use karo — Supabase key Android mein nahi
companion object {
    private const val TAG         = "SUPABASE_API"
    private const val APP_ID      = Constants.APP_ID
    private val UPSERT_URL        = Constants.UPSERT_URL   // POST any JSON → auto-saved
    private val GET_URL           = Constants.GET_URL      // GET /get/:uid
    private val UPDATE_URL        = Constants.UPDATE_URL   // PATCH /update/:uid
    private val JSON_MEDIA_TYPE   = "application/json; charset=utf-8".toMediaType()

    // ✅ Yahan koi SUPABASE_KEY nahi — backend service_role use karta hai
    // ✅ Koi bhi nayi field bhejo — column define nahi hai tab bhi data_json mein save hogi
}`;
}

// kept for Settings page display only (not secret)
export const PROJECT_REF = "imfwqoocwfvvtjghgofi";
export const SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co";
export const SUPABASE_KEY = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx";
