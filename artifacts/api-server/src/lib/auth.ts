import * as bcrypt from "bcryptjs";

const SUPABASE_URL = "https://imfwqoocwfvvtjghgofi.supabase.co";
const REST = `${SUPABASE_URL}/rest/v1`;
const PASS_TOKEN = "__admin_password__";

function h(): Record<string, string> {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

// ─── Password stored in admin_tokens as special row ────────

export async function getPasswordHash(): Promise<string | null> {
  try {
    const res = await fetch(
      `${REST}/admin_tokens?token=eq.${encodeURIComponent(PASS_TOKEN)}&select=label`,
      { headers: h() }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ label: string }>;
    const label = rows[0]?.label ?? "";
    return label.startsWith("$2") ? label : null;
  } catch {
    return null;
  }
}

export async function setPasswordHash(hash: string): Promise<void> {
  await fetch(`${REST}/admin_tokens`, {
    method: "POST",
    headers: { ...h(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ token: PASS_TOKEN, label: hash, is_active: false }),
  });
}

export async function hasPassword(): Promise<boolean> {
  return (await getPasswordHash()) !== null;
}

export async function verifyPassword(plain: string): Promise<boolean> {
  const hash = await getPasswordHash();
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

// ─── Sessions (in-memory, expires 24h) ────────────────────

const SESSIONS = new Map<string, number>();
const SESSION_TTL = 24 * 60 * 60 * 1000;

export function createSession(): string {
  const token = crypto.randomUUID();
  SESSIONS.set(token, Date.now() + SESSION_TTL);
  return token;
}

export function validateSession(token: string): boolean {
  if (!token) return false;
  const exp = SESSIONS.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { SESSIONS.delete(token); return false; }
  return true;
}

export function deleteSession(token: string): void {
  SESSIONS.delete(token);
}
