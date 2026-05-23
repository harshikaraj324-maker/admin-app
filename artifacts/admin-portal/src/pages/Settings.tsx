import { Copy, CheckCircle, Database, Globe, Key, ExternalLink, Lock, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY, PROJECT_REF } from "@/lib/supabase";
import { changePasswordApi } from "@/lib/auth";

export default function Settings() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [chLoading, setChLoading] = useState(false);
  const [chMsg, setChMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const copy = async (val: string, key: string) => {
    await navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!curPass.trim() || !newPass.trim()) return;
    setChLoading(true); setChMsg(null);
    try {
      await changePasswordApi(curPass.trim(), newPass.trim());
      setChMsg({ ok: true, text: "Password updated successfully." });
      setCurPass(""); setNewPass("");
    } catch (err: unknown) {
      setChMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to change password" });
    } finally { setChLoading(false); }
  };

  const rows = [
    { label: "Supabase URL",    value: SUPABASE_URL, icon: Globe,    copyKey: "url" },
    { label: "Publishable Key", value: SUPABASE_KEY, icon: Key,      copyKey: "key" },
    { label: "Project Ref",     value: PROJECT_REF,  icon: Database, copyKey: "ref" },
  ];

  return (
    <div className="flex-1 overflow-auto bg-[#080c16]">
      <div className="sticky top-0 z-10 bg-[#080c16]/90 backdrop-blur border-b border-slate-800/60 h-14 flex items-center px-4 sm:px-6">
        <div>
          <h1 className="text-sm font-semibold text-white">Settings</h1>
          <p className="text-xs text-slate-600">Configuration &amp; security</p>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 max-w-lg">

        {/* Change Password */}
        <div className="bg-[#0d1220] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60">
            <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Lock className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Change Password</p>
              <p className="text-xs text-slate-600">Update your admin password</p>
            </div>
          </div>
          <form onSubmit={(e) => void handleChangePassword(e)} className="p-4 space-y-3">
            <div className="relative">
              <input
                type={showCur ? "text" : "password"}
                value={curPass}
                onChange={(e) => setCurPass(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                className="w-full bg-[#080c16] border border-slate-700/80 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              <button type="button" onClick={() => setShowCur((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                {showCur ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="w-full bg-[#080c16] border border-slate-700/80 rounded-xl px-3 py-2.5 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              <button type="button" onClick={() => setShowNew((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {chMsg && (
              <p className={`text-xs px-3 py-2 rounded-xl border ${
                chMsg.ok
                  ? "text-emerald-400 bg-emerald-900/15 border-emerald-800/30"
                  : "text-red-400 bg-red-900/15 border-red-800/30"
              }`}>{chMsg.text}</p>
            )}
            <button type="submit" disabled={chLoading || !curPass.trim() || !newPass.trim()}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              {chLoading
                ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Updating…</>
                : "Update Password"}
            </button>
          </form>
        </div>

        {/* Supabase config */}
        <div className="bg-[#0d1220] border border-slate-800 rounded-2xl overflow-hidden">
          <p className="text-xs font-semibold text-slate-600 px-4 pt-4 pb-2">Supabase</p>
          {rows.map(({ label, value, icon: Icon, copyKey }, i) => (
            <div key={copyKey}
                 className={`flex items-center gap-3 px-4 py-3 ${i < rows.length - 1 ? "border-b border-slate-800/60" : ""}`}>
              <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-600 mb-0.5">{label}</p>
                <p className="font-mono text-xs text-slate-400 truncate">{value}</p>
              </div>
              <button onClick={() => void copy(value, copyKey)}
                      className="flex items-center gap-1 text-xs text-slate-600 hover:text-white transition-colors flex-shrink-0">
                {copiedKey === copyKey
                  ? <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" />Copied</>
                  : <><Copy className="w-3.5 h-3.5" />Copy</>}
              </button>
            </div>
          ))}
        </div>

        {/* Links */}
        <div className="bg-[#0d1220] border border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-xs font-semibold text-slate-600 mb-3">Quick Links</p>
          {[
            { label: "Supabase Dashboard", href: `https://supabase.com/dashboard/project/${PROJECT_REF}` },
            { label: "Table Editor",       href: `https://supabase.com/dashboard/project/${PROJECT_REF}/editor` },
            { label: "Database Logs",      href: `https://supabase.com/dashboard/project/${PROJECT_REF}/logs/postgres-logs` },
          ].map(({ label, href }) => (
            <a key={href} href={href} target="_blank" rel="noreferrer"
               className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-800/60 transition-colors group">
              <span className="text-sm text-slate-400 group-hover:text-white transition-colors">{label}</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-400 transition-colors" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
