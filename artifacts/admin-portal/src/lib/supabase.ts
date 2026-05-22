const SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co";
const SUPABASE_KEY = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx";
const REST_URL = `${SUPABASE_URL}/rest/v1`;

const baseHeaders = {
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
    const res = await fetch(
      `${REST_URL}/${ADMIN_TOKENS_TABLE}?limit=1`,
      { headers: baseHeaders }
    );
    return res.status !== 404 && res.status !== 400;
  } catch {
    return false;
  }
}

export async function getTokens(): Promise<AdminToken[]> {
  const res = await fetch(
    `${REST_URL}/${ADMIN_TOKENS_TABLE}?order=created_at.desc`,
    { headers: baseHeaders }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt}`);
  }
  return res.json();
}

export async function createToken(token: string, label: string): Promise<AdminToken> {
  const res = await fetch(`${REST_URL}/${ADMIN_TOKENS_TABLE}`, {
    method: "POST",
    headers: { ...baseHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ token, label, is_active: true }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt}`);
  }
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

export async function toggleToken(id: string, is_active: boolean): Promise<void> {
  const res = await fetch(`${REST_URL}/${ADMIN_TOKENS_TABLE}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...baseHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ is_active, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt}`);
  }
}

export async function deleteToken(id: string): Promise<void> {
  const res = await fetch(`${REST_URL}/${ADMIN_TOKENS_TABLE}?id=eq.${id}`, {
    method: "DELETE",
    headers: baseHeaders,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt}`);
  }
}

export function genToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function getSetupSQL(): string {
  return `-- Step 1: Admin Tokens Table banao (ek baar chalao)
CREATE TABLE IF NOT EXISTS admin_tokens (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  token       TEXT         UNIQUE NOT NULL,
  label       TEXT         DEFAULT '',
  is_active   BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Step 2: RLS enable karo
ALTER TABLE admin_tokens ENABLE ROW LEVEL SECURITY;

-- Step 3: Anon access allow karo (publishable key ke liye)
CREATE POLICY "Allow all for anon"
  ON admin_tokens FOR ALL TO anon
  USING (true) WITH CHECK (true);`;
}

export function getDeviceTableSQL(token: string): string {
  return `-- Android Device Table for token: ${token}
CREATE TABLE IF NOT EXISTS ${token}_registered_devices (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  sub_id      TEXT    NOT NULL UNIQUE,
  app_id      TEXT    NOT NULL DEFAULT '${token}',
  data_type   TEXT    DEFAULT '',
  data_json   JSONB   DEFAULT '{}',
  created_at  BIGINT  DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
  updated_at  BIGINT  DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

ALTER TABLE ${token}_registered_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon"
  ON ${token}_registered_devices FOR ALL TO anon
  USING (true) WITH CHECK (true);`;
}

export function getConstantsKt(token: string): string {
  return `object Constants {
    const val SUPABASE_URL  = "https://imfwqoocwfvvtjghgofi.supabase.co"
    const val SUPABASE_KEY  = "sb_publishable_nrr3KfNnDXEiQ2QZNgBa4Q_IujWd0Qx"
    const val REST_URL      = "${'$'}{SUPABASE_URL}/rest/v1"
    // Change sirf APP_ID karo — baaki sab automatically follow karega
    const val APP_ID        = "${token}"

    const val BASE_URL = "${'$'}{REST_URL}/"
}`;
}
