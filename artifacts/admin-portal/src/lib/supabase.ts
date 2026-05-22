const SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co";
const SUPABASE_KEY = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx";
const REST_URL = `${SUPABASE_URL}/rest/v1`;

const baseHeaders: Record<string, string> = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

export const ADMIN_TOKENS_TABLE = "admin_tokens";

export interface AdminToken {
  id: string;
  token: string;
  label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function checkSetupDone(): Promise<boolean> {
  try {
    const res = await fetch(`${REST_URL}/${ADMIN_TOKENS_TABLE}?limit=1`, {
      headers: baseHeaders,
    });
    return res.status !== 404 && res.status !== 400 && res.status < 500;
  } catch {
    return false;
  }
}

export async function getTokens(): Promise<AdminToken[]> {
  const res = await fetch(
    `${REST_URL}/${ADMIN_TOKENS_TABLE}?order=created_at.desc`,
    { headers: baseHeaders }
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function createAppTable(token: string): Promise<void> {
  const res = await fetch(`${REST_URL}/rpc/create_app_device_table`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ app_token: token }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Table auto-create failed (${res.status}): ${txt}`);
  }
}

export async function createToken(
  token: string,
  label: string
): Promise<AdminToken> {
  await createAppTable(token);

  const res = await fetch(`${REST_URL}/${ADMIN_TOKENS_TABLE}`, {
    method: "POST",
    headers: { ...baseHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ token, label, is_active: true }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

export async function toggleToken(id: string, is_active: boolean): Promise<void> {
  const res = await fetch(`${REST_URL}/${ADMIN_TOKENS_TABLE}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...baseHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ is_active, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export async function deleteToken(id: string): Promise<void> {
  const res = await fetch(`${REST_URL}/${ADMIN_TOKENS_TABLE}?id=eq.${id}`, {
    method: "DELETE",
    headers: baseHeaders,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}

export function genToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function getSetupSQL(): string {
  return `-- ─────────────────────────────────────────────────────────────
-- STEP 1 : Admin Tokens table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_tokens (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  token       TEXT         UNIQUE NOT NULL,
  label       TEXT         DEFAULT '',
  is_active   BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE admin_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all" ON admin_tokens
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- STEP 2 : Auto-create function (token save hote hi table ban
--          jaayegi — dobara SQL editor nahi kholna padega)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_app_device_table(app_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tname TEXT := app_token || '_registered_devices';
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
      sub_id      TEXT    NOT NULL UNIQUE,
      app_id      TEXT    NOT NULL DEFAULT %L,
      data_type   TEXT    DEFAULT '''',
      data_json   JSONB   DEFAULT ''{}''::jsonb,
      created_at  BIGINT  DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      updated_at  BIGINT  DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )', tname, app_token);

  EXECUTE format(
    'ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tname);

  EXECUTE format('
    DO $d$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = %L AND policyname = %L
      ) THEN
        CREATE POLICY "anon_all" ON %I
          FOR ALL TO anon USING (true) WITH CHECK (true);
      END IF;
    END $d$
  ', tname, 'anon_all', tname);

  RETURN tname;
END;
$$;

GRANT EXECUTE ON FUNCTION create_app_device_table(TEXT) TO anon;`;
}

export function getConstantsKt(token: string): string {
  return `object Constants {
    const val SUPABASE_URL  = "https://imfwqoocwfvvtjghgofi.supabase.co"
    const val SUPABASE_KEY  = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx"
    const val REST_URL      = "\${SUPABASE_URL}/rest/v1"
    // Sirf APP_ID badlo — table naam auto-follow karega
    const val APP_ID        = "${token}"
    const val BASE_URL      = "\${REST_URL}/"
}`;
}
