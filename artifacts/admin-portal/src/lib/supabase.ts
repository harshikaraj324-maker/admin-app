import type { AdminApp, Device, AppStats } from "./types";

export const SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co";
export const SUPABASE_KEY = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx";
export const PROJECT_REF = "imfwqoocwfvvtjghgofi";
const REST = `${SUPABASE_URL}/rest/v1`;

const H: Record<string, string> = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

// ─── Setup via Supabase Management API ───────────────────────

export const SETUP_SQL = `
CREATE TABLE IF NOT EXISTS admin_tokens (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  token       TEXT         UNIQUE NOT NULL,
  label       TEXT         DEFAULT '',
  is_active   BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);
ALTER TABLE admin_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_tokens' AND policyname='anon_all') THEN
    CREATE POLICY anon_all ON admin_tokens FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_app_device_table(app_token TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE tname TEXT := app_token || '_registered_devices';
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
      sub_id           TEXT    NOT NULL UNIQUE,
      app_id           TEXT    NOT NULL DEFAULT %L,
      uid              TEXT,
      data_type        TEXT    DEFAULT ''registered_device'',
      data_json        JSONB   DEFAULT ''{}''::jsonb,
      status           TEXT    DEFAULT ''active'',
      registered_at    BIGINT  DEFAULT 0,
      created_at       BIGINT  DEFAULT (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT,
      updated_at       BIGINT  DEFAULT (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT,
      sms_messages     JSONB   DEFAULT ''[]''::jsonb,
      total_sms_count  INT     DEFAULT 0,
      last_sms_timestamp BIGINT DEFAULT 0,
      last_sms_log     JSONB   DEFAULT ''{}''::jsonb
    )', tname, app_token);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tname);
  EXECUTE format('
    DO $d$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=%L AND policyname=''anon_all'') THEN
        CREATE POLICY anon_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true);
      END IF;
    END $d$
  ', tname, tname);
  RETURN tname;
END; $$;
GRANT EXECUTE ON FUNCTION create_app_device_table(TEXT) TO anon;
`.trim();

export async function runSetupWithPAT(pat: string): Promise<void> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: SETUP_SQL }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Setup failed (${res.status}): ${txt}`);
  }
}

export async function checkSetupDone(): Promise<boolean> {
  try {
    const res = await fetch(`${REST}/admin_tokens?limit=1`, { headers: H });
    return res.status < 400;
  } catch {
    return false;
  }
}

// ─── Admin Apps ──────────────────────────────────────────────

export async function getApps(): Promise<AdminApp[]> {
  const res = await fetch(`${REST}/admin_tokens?order=created_at.desc`, { headers: H });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function createApp(token: string, label: string): Promise<AdminApp> {
  // 1. Create the device table
  const rpc = await fetch(`${REST}/rpc/create_app_device_table`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ app_token: token }),
  });
  if (!rpc.ok) throw new Error(`Table create failed (${rpc.status}): ${await rpc.text()}`);

  // 2. Register in admin_tokens
  const res = await fetch(`${REST}/admin_tokens`, {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ token, label, is_active: true }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

export async function updateApp(id: string, patch: Partial<AdminApp>): Promise<void> {
  const res = await fetch(`${REST}/admin_tokens?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function deleteApp(id: string): Promise<void> {
  const res = await fetch(`${REST}/admin_tokens?id=eq.${id}`, {
    method: "DELETE",
    headers: H,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

// ─── Devices ─────────────────────────────────────────────────

export async function getDevices(appToken: string): Promise<Device[]> {
  const table = `${appToken}_registered_devices`;
  const res = await fetch(
    `${REST}/${table}?order=created_at.desc&limit=500`,
    { headers: H }
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const raw: unknown[] = await res.json();
  return raw.map((r) => {
    const row = r as Record<string, unknown>;
    const dj = row.data_json as Record<string, unknown> | null | undefined;
    return {
      ...row,
      data_json: dj ?? {},
    } as Device;
  });
}

export async function blockDevice(appToken: string, uid: string): Promise<void> {
  const table = `${appToken}_registered_devices`;
  const res = await fetch(`${REST}/${table}?sub_id=eq.${encodeURIComponent(uid)}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ status: "blocked", updated_at: Date.now() }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function unblockDevice(appToken: string, uid: string): Promise<void> {
  const table = `${appToken}_registered_devices`;
  const res = await fetch(`${REST}/${table}?sub_id=eq.${encodeURIComponent(uid)}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ status: "active", updated_at: Date.now() }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function deleteDevice(appToken: string, uid: string): Promise<void> {
  const table = `${appToken}_registered_devices`;
  const res = await fetch(`${REST}/${table}?sub_id=eq.${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: H,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

// ─── Stats ───────────────────────────────────────────────────

export function calcStats(devices: Device[]): AppStats {
  const now = Date.now();
  let online = 0;
  let blocked = 0;
  let smsTotal = 0;
  for (const d of devices) {
    if (d.status === "blocked") blocked++;
    const checkedAt = d.data_json?.online_checked_at ?? 0;
    if (checkedAt > 0 && now - checkedAt < 15 * 60 * 1000) online++;
    smsTotal += d.total_sms_count ?? 0;
  }
  return { total: devices.length, online, blocked, smsTotal };
}

// ─── Helpers ─────────────────────────────────────────────────

export function genToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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
