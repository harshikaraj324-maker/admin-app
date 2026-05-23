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
      last_heartbeat_at  BIGINT DEFAULT 0,
      created_at         BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT,
      updated_at         BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())*1000)::BIGINT,
      sms_messages       JSONB  DEFAULT '[]'::jsonb,
      total_sms_count    INT    DEFAULT 0,
      last_sms_timestamp BIGINT DEFAULT 0,
      last_sms_log       JSONB  DEFAULT '{}'::jsonb
    );
    ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
    -- service_role: full access (admin portal backend)
    DO $d$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = '${tableName}' AND policyname = 'service_all'
      ) THEN
        CREATE POLICY service_all ON ${tableName}
          FOR ALL TO service_role USING (true) WITH CHECK (true);
      END IF;
    END $d$;
    -- anon role: Android app uses publishable key (anon) — allow insert + update + select
    DO $a$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = '${tableName}' AND policyname = 'anon_read'
      ) THEN
        CREATE POLICY anon_read ON ${tableName}
          FOR SELECT TO anon USING (true);
      END IF;
    END $a$;
    DO $b$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = '${tableName}' AND policyname = 'anon_insert'
      ) THEN
        CREATE POLICY anon_insert ON ${tableName}
          FOR INSERT TO anon WITH CHECK (true);
      END IF;
    END $b$;
    DO $c$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = '${tableName}' AND policyname = 'anon_update'
      ) THEN
        CREATE POLICY anon_update ON ${tableName}
          FOR UPDATE TO anon USING (true) WITH CHECK (true);
      END IF;
    END $c$;

    -- ── Supabase Realtime setup ──────────────────────────────────
    -- REPLICA IDENTITY FULL: DELETE events will carry ALL columns
    -- (DEFAULT = only PK, so sub_id would be missing in delete events)
    ALTER TABLE ${tableName} REPLICA IDENTITY FULL;

    -- Add to supabase_realtime publication so WebSocket events fire
    DO $rt$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = '${tableName}'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE ${tableName};
      END IF;
    END $rt$;
  `;
  await runSqlViaMgmt(sql, pat);
}

// ─── Fix existing table (add missing columns + anon policies) ─
export async function fixDeviceTable(
  appToken: string,
  pat: string
): Promise<void> {
  const tableName = `${appToken}_registered_devices`;
  const sql = `
    -- Add missing columns (safe — IF NOT EXISTS)
    ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS last_heartbeat_at BIGINT DEFAULT 0;
    ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS registered_at      BIGINT DEFAULT 0;
    ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS sms_messages       JSONB  DEFAULT '[]'::jsonb;
    ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS total_sms_count    INT    DEFAULT 0;
    ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS last_sms_timestamp BIGINT DEFAULT 0;
    ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS last_sms_log       JSONB  DEFAULT '{}'::jsonb;

    -- Ensure RLS is on
    ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

    -- service_role policy
    DO $d$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = '${tableName}' AND policyname = 'service_all'
      ) THEN
        CREATE POLICY service_all ON ${tableName}
          FOR ALL TO service_role USING (true) WITH CHECK (true);
      END IF;
    END $d$;
    -- anon SELECT
    DO $a$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = '${tableName}' AND policyname = 'anon_read'
      ) THEN
        CREATE POLICY anon_read ON ${tableName}
          FOR SELECT TO anon USING (true);
      END IF;
    END $a$;
    -- anon INSERT
    DO $b$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = '${tableName}' AND policyname = 'anon_insert'
      ) THEN
        CREATE POLICY anon_insert ON ${tableName}
          FOR INSERT TO anon WITH CHECK (true);
      END IF;
    END $b$;
    -- anon UPDATE
    DO $c$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = '${tableName}' AND policyname = 'anon_update'
      ) THEN
        CREATE POLICY anon_update ON ${tableName}
          FOR UPDATE TO anon USING (true) WITH CHECK (true);
      END IF;
    END $c$;

    -- ── Supabase Realtime setup ──────────────────────────────────
    -- REPLICA IDENTITY FULL: DELETE events will carry ALL columns
    -- (DEFAULT = only PK, so sub_id would be missing in delete events)
    ALTER TABLE ${tableName} REPLICA IDENTITY FULL;

    -- Add to supabase_realtime publication so WebSocket events fire
    DO $rt$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = '${tableName}'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE ${tableName};
      END IF;
    END $rt$;
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

// ─── Deleted-device blocklist (in-memory, server-scoped) ────────────────────
// Stores "<appToken>:<subId>" strings so that re-registration attempts from
// Android heartbeats are silently rejected after a hard-delete.
const deletedDevicesSet = new Set<string>();

function blockKey(appToken: string, subId: string) {
  return `${appToken}:${subId}`;
}

export function markDeviceDeleted(appToken: string, subId: string) {
  deletedDevicesSet.add(blockKey(appToken, subId));
}

export function isDeviceDeleted(appToken: string, subId: string) {
  return deletedDevicesSet.has(blockKey(appToken, subId));
}

// ─── Smart Device Upsert — any payload, auto-merges into data_json ──────────

/** Columns that exist as real DB columns in every device table */
const KNOWN_COLUMNS = new Set([
  "sub_id", "app_id", "uid", "data_type", "status",
  "last_heartbeat_at", "registered_at",
  "created_at", "updated_at",
  "sms_messages", "total_sms_count", "last_sms_timestamp", "last_sms_log",
  "data_json",
]);

/**
 * Accept ANY flat payload from Android.
 * Known columns → top-level DB columns.
 * Unknown/extra fields → deep-merged into data_json.
 * Uses service_role so no RLS issues.
 *
 * IMPORTANT: data_json is always MERGED (existing base + incoming overwrite),
 * never replaced. This ensures device info (model, manufacturer, SIM numbers)
 * persists across heartbeat updates.
 */
export async function deviceSmartUpsert(
  appToken: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const table = `${appToken}_registered_devices`;
  const subId = (payload["sub_id"] ?? payload["uid"]) as string | undefined;
  if (!subId) throw new Error("sub_id or uid is required");

  const now = Date.now();
  const knownRow: Record<string, unknown> = { updated_at: now };
  const extraFields: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(payload)) {
    if (KNOWN_COLUMNS.has(key)) {
      knownRow[key] = val;
    } else {
      // unknown field — will be stored inside data_json
      extraFields[key] = val;
    }
  }

  // ── Block deleted devices first (in-memory check, no DB round-trip) ────────
  if (isDeviceDeleted(appToken, subId)) {
    throw new Error("DEVICE_DELETED");
  }

  // ── Fetch existing row to check status + merge data_json ─────────────────
  // This preserves device info (model, manufacturer, SIM numbers etc.) across
  // heartbeat / partial updates that only carry a subset of fields.
  let existingDataJson: Record<string, unknown> = {};
  try {
    const existingRes = await fetch(
      `${REST}/${encodeURIComponent(table)}?sub_id=eq.${encodeURIComponent(subId)}&select=data_json,status&limit=1`,
      { headers: h() }
    );
    if (existingRes.ok) {
      const arr = (await existingRes.json()) as Array<{
        data_json?: Record<string, unknown>;
        status?: string;
      }>;
      if (arr.length > 0) {
        // Also block if DB row has status='blocked' (admin blocked, not deleted)
        if (arr[0].status === "blocked") {
          throw new Error("DEVICE_BLOCKED");
        }
        if (arr[0].data_json && typeof arr[0].data_json === "object") {
          existingDataJson = arr[0].data_json as Record<string, unknown>;
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("DEVICE_")) throw err;
    /* new device — no existing row, start fresh */
  }

  // Merge: existing is the base, incoming fields overwrite selectively
  const incomingDataJson =
    (knownRow["data_json"] as Record<string, unknown> | null) ?? {};
  knownRow["data_json"] = {
    ...existingDataJson,   // ← keep all existing fields (model, SIMs, etc.)
    ...incomingDataJson,   // ← payload's data_json overwrites where set
    ...extraFields,        // ← flat unknown fields also land in data_json
  };

  // Ensure required top-level fields
  knownRow["sub_id"] = subId;
  knownRow["app_id"] = knownRow["app_id"] ?? appToken;
  knownRow["uid"] = knownRow["uid"] ?? subId;
  knownRow["data_type"] = knownRow["data_type"] ?? "registered_device";
  if (!knownRow["created_at"]) knownRow["created_at"] = now;

  const doUpsert = async (
    row: Record<string, unknown>
  ): Promise<unknown> => {
    const res = await fetch(
      `${REST}/${encodeURIComponent(table)}?on_conflict=sub_id`,
      {
        method: "POST",
        headers: h({ Prefer: "resolution=merge-duplicates,return=representation" }),
        body: JSON.stringify(row),
      }
    );

    if (!res.ok) {
      const text = await res.text();

      // ── Auto-heal: column missing (PGRST204) ─────────────────
      // Extract the offending column name and move it into data_json
      if (res.status === 400) {
        let errObj: { code?: string; message?: string } = {};
        try { errObj = JSON.parse(text) as typeof errObj; } catch { /* noop */ }

        if (errObj.code === "PGRST204" && errObj.message) {
          // message: "Could not find the 'some_col' column of 'table' in the schema cache"
          const match = errObj.message.match(/Could not find the '([^']+)' column/);
          if (match?.[1]) {
            const badCol = match[1];
            const colVal = row[badCol];
            // move the bad column into data_json and remove from top-level
            delete row[badCol];
            const dj = (row["data_json"] as Record<string, unknown> | null) ?? {};
            row["data_json"] = { ...dj, [badCol]: colVal };
            // ↑ retry once with the healed row
            return doUpsert(row);
          }
        }
      }

      throw new Error(`deviceSmartUpsert: ${res.status} ${text}`);
    }

    const arr = (await res.json()) as unknown[];
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : arr;
  };

  return doUpsert(knownRow);
}

export async function deviceGetByUid(
  appToken: string,
  uid: string
): Promise<unknown | null> {
  const table = `${appToken}_registered_devices`;
  const res = await fetch(
    `${REST}/${encodeURIComponent(table)}?sub_id=eq.${encodeURIComponent(uid)}&limit=1`,
    { headers: h() }
  );
  if (!res.ok) throw new Error(`deviceGetByUid: ${res.status} ${await res.text()}`);
  const arr = (await res.json()) as unknown[];
  return arr.length > 0 ? arr[0] : null;
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
  // Mark in-memory so Android heartbeats cannot re-register this device
  markDeviceDeleted(appToken, subId);
}
