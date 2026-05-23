import { useState, useEffect } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { checkAuthStatus, loginApi, saveSessionToken } from "@/lib/auth";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    checkAuthStatus().then((s) => setPasswordSet(s.passwordSet)).catch(() => setPasswordSet(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true); setError("");
    try {
      const { token } = await loginApi(password.trim());
      saveSessionToken(token);
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally { setLoading(false); }
  };

  const isFirstTime = passwordSet === false;

  return (
    <div className="min-h-screen bg-[#080c16] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center mb-3 shadow-lg shadow-blue-900/40">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Admin Portal</h1>
          <p className="text-sm text-slate-500 mt-1">
            {passwordSet === null
              ? "Connecting…"
              : isFirstTime
              ? "First time — set your admin password"
              : "Sign in to continue"}
          </p>
        </div>

        {passwordSet === null ? (
          <div className="flex justify-center">
            <span className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isFirstTime ? "Create a password" : "Password"}
                autoFocus
                autoComplete={isFirstTime ? "new-password" : "current-password"}
                className="w-full bg-[#0d1220] border border-slate-700/80 rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
              <button type="button" onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-900/15 border border-red-800/30 rounded-xl px-3 py-2.5">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading || !password.trim()}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Please wait…</>
                : isFirstTime ? "Set Password" : "Sign In"}
            </button>

            {isFirstTime && (
              <p className="text-[11px] text-slate-600 text-center">
                This password will be used for all future logins
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
