// Backend-only — service key + DB URL never leave the server
import pg from "pg";

const { Pool } = pg;

const SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co";
const REST = `${SUPABASE_URL}/rest/v1`;

function getServiceKey(): string {
  const k = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return k;
}

function getDbUrl(): string {
  const raw = process.env["SUPABASE_DB_URL"];
  if (!raw) throw new Error("SUPABASE_DB_URL not set");
  // Strip accidental wrapper: DATABASE_URL="postgresql://..." -> postgresql://...
  return raw.replace(/^[A-Z_]+=["']?|["']?$/g, "").trim();
}

let _pool: pg.Pool | null = null;
function pool(): pg.Pool {
  if (!_pool) {
    const raw = getDbUrl();
    const u = new URL(raw);
    // Supabase direct host (db.xxx.supabase.co:5432) resolves to IPv6 only.
    // Use the transaction pooler (port 6543) which has IPv4 addresses.
    // Pooler requires user format: postgres.<project-ref>
    const connStr =
      `postgresql://postgres.imfwqoocwfvvtjghgofi:${u.password}` +
      `@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
    _pool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return _pool;
}

function h(extra: Record<string, string> = {}): Record<string, string> {
  const key = getServiceKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// ─── DDL via direct Postgres connection ────────────────────

async function sql(query: string): Promise<void> {
  const client = await pool().connect();
  try {
    await client.query(query);
  } finally {
    client.release();
  }
}

// ─── Setup SQL (idempotent) ─────────────────────────────────

const SETUP_SQL = `
-- admin_tokens table
CREATE TABLE IF NOT EXISTS admin_tokens (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  token      TEXT        UNIQUE NOT NULL,
  label      TEXT        DEFAULT '',
  is_active  BOOLEAN     DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE admin_tokens ENABLE ROW LEVEL SECURITY;

-- Policy (skip if exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_tokens' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY anon_all ON admin_tokens
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Auto-create function for device tables
CREATE OR REPLACE FUNCTION create_app_device_table(app_token TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE tname TEXT := app_token || '_registered_devices';
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id                 UUID   DEFAULT gen_random_uuid() PRIMARY KEY,
      sub_id             TEXT   NOT NULL UNIQUE,
      app_id             TEXT   NOT NULL DEFAULT %L,
      uid                TEXT,
      data_type          TEXT   DEFAULT ''registered_device'',
      data_json          JSONB  DEFAULT ''{}''::jsonb,
      status             TEXT   DEFAULT ''active'',
      registered_at      BIGINT DEFAULT 0,
      created_at         BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT,
      updated_at         BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT,
      sms_messages       JSONB  DEFAULT ''[]''::jsonb,
      total_sms_count    INT    DEFAULT 0,
      last_sms_timestamp BIGINT DEFAULT 0,
      last_sms_log       JSONB  DEFAULT ''{}''::jsonb
    )', tname, app_token);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tname);
  EXECUTE format('
    DO $d$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = %L AND policyname = ''anon_all''
      ) THEN
        CREATE POLICY anon_all ON %I
          FOR ALL TO anon USING (true) WITH CHECK (true);
      END IF;
    END $d$
  ', tname, tname);
  RETURN tname;
END; $fn$;

GRANT EXECUTE ON FUNCTION create_app_device_table(TEXT) TO anon;
`;

// ─── Auto-run setup on server start ────────────────────────

let _setupDone = false;

export async function ensureSetup(): Promise<void> {
  if (_setupDone) return;
  await sql(SETUP_SQL);
  _setupDone = true;
}

export async function checkSetup(): Promise<boolean> {
  try {
    const client = await pool().connect();
    try {
      const res = await client.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'admin_tokens'
        ) AS exists`
      );
      return (res.rows[0] as { exists: boolean }).exists === true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}

export async function runSetup(): Promise<void> {
  await sql(SETUP_SQL);
  _setupDone = true;
}

// ─── Apps ───────────────────────────────────────────────────

export async function getApps(): Promise<unknown[]> {
  await ensureSetup();
  const res = await fetch(`${REST}/admin_tokens?order=created_at.desc`, {
    headers: h(),
  });
  if (!res.ok) throw new Error(`getApps: ${res.status} ${await res.text()}`);
  return res.json() as Promise<unknown[]>;
}

export async function createApp(token: string, label: string): Promise<unknown> {
  await ensureSetup();

  // 1. Create device table via Postgres directly
  await sql(
    `SELECT create_app_device_table('${token.replace(/'/g, "''")}')`
  );

  // 2. Insert token record via REST
  const res = await fetch(`${REST}/admin_tokens`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({ token, label, is_active: true }),
  });
  if (!res.ok) throw new Error(`createApp: ${res.status} ${await res.text()}`);
  const arr = (await res.json()) as unknown[];
  return Array.isArray(arr) ? arr[0] : arr;
}

export async function updateApp(
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  await ensureSetup();
  const res = await fetch(`${REST}/admin_tokens?id=eq.${id}`, {
    method: "PATCH",
    headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`updateApp: ${res.status} ${await res.text()}`);
}

export async function deleteApp(id: string): Promise<void> {
  await ensureSetup();
  const res = await fetch(`${REST}/admin_tokens?id=eq.${id}`, {
    method: "DELETE",
    headers: h(),
  });
  if (!res.ok) throw new Error(`deleteApp: ${res.status} ${await res.text()}`);
}

// ─── Devices ────────────────────────────────────────────────

export async function getDevices(appToken: string): Promise<unknown[]> {
  const table = `${appToken}_registered_devices`;
  const res = await fetch(`${REST}/${table}?order=created_at.desc&limit=500`, {
    headers: h(),
  });
  if (!res.ok) throw new Error(`getDevices: ${res.status} ${await res.text()}`);
  return res.json() as Promise<unknown[]>;
}

export async function patchDevice(
  appToken: string,
  uid: string,
  patch: Record<string, unknown>
): Promise<void> {
  const table = `${appToken}_registered_devices`;
  const encoded = encodeURIComponent(uid);
  const res = await fetch(`${REST}/${table}?sub_id=eq.${encoded}`, {
    method: "PATCH",
    headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ ...patch, updated_at: Date.now() }),
  });
  if (!res.ok) throw new Error(`patchDevice: ${res.status} ${await res.text()}`);
}

export async function deleteDevice(
  appToken: string,
  uid: string
): Promise<void> {
  const table = `${appToken}_registered_devices`;
  const encoded = encodeURIComponent(uid);
  const res = await fetch(`${REST}/${table}?sub_id=eq.${encoded}`, {
    method: "DELETE",
    headers: h(),
  });
  if (!res.ok) throw new Error(`deleteDevice: ${res.status} ${await res.text()}`);
}
