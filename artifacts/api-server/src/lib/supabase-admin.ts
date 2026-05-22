// Backend-only — service key never leaves the server
const SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co";
const PROJECT_REF = "imfwqoocwfvvtjghgofi";
const REST = `${SUPABASE_URL}/rest/v1`;

function getServiceKey(): string {
  const k = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return k;
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

// ─── Management API SQL (uses PAT — only needed for DDL setup) ──

export async function runSqlViaMgmt(sql: string, pat: string): Promise<void> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API ${res.status}: ${text}`);
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

ALTER TABLE admin_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'admin_tokens' AND policyname = 'service_all'
  ) THEN
    CREATE POLICY service_all ON admin_tokens
      FOR ALL TO service_role USING (true) WITH CHECK (true);
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
        WHERE tablename = %L AND policyname = ''service_all''
      ) THEN
        CREATE POLICY service_all ON %I
          FOR ALL TO service_role USING (true) WITH CHECK (true);
      END IF;
    END $d$
  ', tname, tname);
  RETURN tname;
END; $fn$;

GRANT EXECUTE ON FUNCTION create_app_device_table(TEXT) TO service_role;
`;

// ─── Check setup via REST API ───────────────────────────────

export async function checkSetup(): Promise<boolean> {
  try {
    const res = await fetch(`${REST}/admin_tokens?limit=1`, { headers: h() });
    // 200 = table exists, 404/PGRST = table missing
    return res.ok;
  } catch {
    return false;
  }
}

export async function runSetup(pat: string): Promise<void> {
  await runSqlViaMgmt(SETUP_SQL, pat);
}

// ─── Create device table for a new app (via Management API) ─

export async function createDeviceTable(
  appToken: string,
  pat: string
): Promise<void> {
  const tableName = `${appToken}_registered_devices`;
  const sql = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id                 UUID   DEFAULT gen_random_uuid() PRIMARY KEY,
      sub_id             TEXT   NOT NULL UNIQUE,
      app_id             TEXT   NOT NULL DEFAULT '${appToken.replace(/'/g, "''")}',
      uid                TEXT,
      data_type          TEXT   DEFAULT 'registered_device',
      data_json          JSONB  DEFAULT '{}'::jsonb,
      status             TEXT   DEFAULT 'active',
      registered_at      BIGINT DEFAULT 0,
      created_at         BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT,
      updated_at         BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT,
      sms_messages       JSONB  DEFAULT '[]'::jsonb,
      total_sms_count    INT    DEFAULT 0,
      last_sms_timestamp BIGINT DEFAULT 0,
      last_sms_log       JSONB  DEFAULT '{}'::jsonb
    );
    ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
    DO $d$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = '${tableName}' AND policyname = 'service_all'
      ) THEN
        CREATE POLICY service_all ON ${tableName}
          FOR ALL TO service_role USING (true) WITH CHECK (true);
      END IF;
    END $d$;
  `;
  await runSqlViaMgmt(sql, pat);
}

// ─── Apps (REST API — no Postgres needed) ───────────────────

export async function getApps(): Promise<unknown[]> {
  const res = await fetch(`${REST}/admin_tokens?order=created_at.desc`, {
    headers: h(),
  });
  if (!res.ok) throw new Error(`getApps: ${res.status} ${await res.text()}`);
  return res.json() as Promise<unknown[]>;
}

export async function createApp(
  token: string,
  label: string,
  pat: string
): Promise<unknown> {
  // 1. Create device table via Management API
  await createDeviceTable(token, pat);

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
  const res = await fetch(`${REST}/admin_tokens?id=eq.${id}`, {
    method: "PATCH",
    headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`updateApp: ${res.status} ${await res.text()}`);
}

export async function deleteApp(id: string): Promise<void> {
  const res = await fetch(`${REST}/admin_tokens?id=eq.${id}`, {
    method: "DELETE",
    headers: h(),
  });
  if (!res.ok) throw new Error(`deleteApp: ${res.status} ${await res.text()}`);
}

// ─── Devices (REST API) ──────────────────────────────────────

export async function getDevices(appToken: string): Promise<unknown[]> {
  const table = `${appToken}_registered_devices`;
  const res = await fetch(
    `${REST}/${encodeURIComponent(table)}?order=created_at.desc&limit=500`,
    { headers: h() }
  );
  if (!res.ok) throw new Error(`getDevices: ${res.status} ${await res.text()}`);
  return res.json() as Promise<unknown[]>;
}

export async function patchDevice(
  appToken: string,
  subId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const table = `${appToken}_registered_devices`;
  const res = await fetch(
    `${REST}/${encodeURIComponent(table)}?sub_id=eq.${encodeURIComponent(subId)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ ...patch, updated_at: Date.now() }),
    }
  );
  if (!res.ok) throw new Error(`patchDevice: ${res.status} ${await res.text()}`);
}

export async function deleteDevice(
  appToken: string,
  subId: string
): Promise<void> {
  const table = `${appToken}_registered_devices`;
  const res = await fetch(
    `${REST}/${encodeURIComponent(table)}?sub_id=eq.${encodeURIComponent(subId)}`,
    {
      method: "DELETE",
      headers: h(),
    }
  );
  if (!res.ok) throw new Error(`deleteDevice: ${res.status} ${await res.text()}`);
}
