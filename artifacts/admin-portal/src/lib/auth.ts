const SESSION_KEY = "admin_session_token";

export function getSessionToken(): string {
  return localStorage.getItem(SESSION_KEY) ?? "";
}

export function saveSessionToken(token: string): void {
  localStorage.setItem(SESSION_KEY, token);
}

export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_KEY);
}

export async function checkAuthStatus(): Promise<{ passwordSet: boolean }> {
  const res = await fetch("/api/admin/auth/status");
  return res.json() as Promise<{ passwordSet: boolean }>;
}

export async function loginApi(password: string): Promise<{ token: string; firstTime?: boolean }> {
  const res = await fetch("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? "Login failed");
  }
  return res.json() as Promise<{ token: string; firstTime?: boolean }>;
}

export async function logoutApi(): Promise<void> {
  await fetch("/api/admin/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${getSessionToken()}` },
  }).catch(() => {});
  clearSessionToken();
}

export async function changePasswordApi(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch("/api/admin/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getSessionToken()}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error ?? "Change failed");
  }
}
