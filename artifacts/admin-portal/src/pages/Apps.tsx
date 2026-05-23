import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Power, PowerOff, RefreshCw,
  Smartphone, Copy, CheckCircle, X, Key, Radio
} from "lucide-react";
import Badge from "@/components/Badge";
import type { AdminApp } from "@/lib/types";
import { getApps, createApp, updateApp, deleteApp, genToken, getConstantsKt, getPat, savePat, fixRealtime } from "@/lib/supabase";

export default function Apps() {
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [fLabel, setFLabel] = useState("");
  const [fToken, setFToken] = useState(genToken());
  const [fPat, setFPat] = useState(getPat());
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [createErr, setCreateErr] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ktId, setKtId] = useState<string | null>(null);
  const [fixingRtId, setFixingRtId] = useState<string | null>(null);
  const [rtMsg, setRtMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setApps(await getApps()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = async () => {
    const tok = fToken.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!tok) return;
    if (!fPat.trim()) { setCreateErr("PAT required — setup page se copy karo ya daalo"); return; }
    setCreating(true); setCreateErr(""); setCreateMsg("Supabase mein table ban rahi hai…");
    try {
      savePat(fPat.trim());
      const a = await createApp(tok, fLabel.trim(), fPat.trim());
      setApps((p) => [a, ...p]);
      setShowForm(false); setFToken(genToken()); setFLabel(""); setCreateMsg("");
    } catch (e: unknown) {
      setCreateErr(e instanceof Error ? e.message : "Create failed");
      setCreateMsg("");
    } finally { setCreating(false); }
  };

  const handleToggle = async (app: AdminApp) => {
    try {
      await updateApp(app.id, { is_active: !app.is_active });
      setApps((p) => p.map((a) => a.id === app.id ? { ...a, is_active: !app.is_active } : a));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Error"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Ye app delete karo? Device data table bhi hatao Supabase se manually.")) return;
    try { await deleteApp(id); setApps((p) => p.filter((a) => a.id !== id)); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : "Error"); }
  };

  const handleFixRealtime = async (app: AdminApp) => {
    setFixingRtId(app.id); setRtMsg(null);
    try {
      await fixRealtime(app.token);
      setRtMsg({ id: app.id, ok: true, text: "✓ Realtime enabled! Live data ab kaam karega." });
    } catch (e: unknown) {
      setRtMsg({ id: app.id, ok: false, text: e instanceof Error ? e.message : "Fix failed" });
    } finally {
      setFixingRtId(null);
      setTimeout(() => setRtMsg(null), 6000);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-[#080c16]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-[#080c16]/90 backdrop-blur border-b border-slate-800/60 h-14 flex items-center justify-between px-6">
        <div>
          <h1 className="text-sm font-semibold text-white">Applications</h1>
          <p className="text-xs text-slate-600">{apps.length} registered</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => { setShowForm(true); setCreateErr(""); setCreateMsg(""); setFPat(getPat()); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors">
            <Plus className="w-3.5 h-3.5" />New App
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Create form */}
        {showForm && (
          <div className="bg-[#0d1220] border border-blue-500/25 rounded-2xl p-5 shadow-xl shadow-blue-900/10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-white">Naya App Banao</h2>
              <button onClick={() => setShowForm(false)}
                      className="p-1 rounded-lg hover:bg-slate-800 text-slate-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block font-medium">App Name</label>
                <input value={fLabel} onChange={(e) => setFLabel(e.target.value)}
                       placeholder="e.g. RTO App Delhi"
                       className="w-full bg-[#0a0e1a] border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm placeholder-slate-700 focus:outline-none focus:border-blue-500/60 transition-colors text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block font-medium">App ID</label>
                <div className="flex gap-2">
                  <input value={fToken}
                         onChange={(e) => setFToken(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                         placeholder="rto27"
                         className="flex-1 bg-[#0a0e1a] border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm font-mono placeholder-slate-700 focus:outline-none focus:border-blue-500/60 transition-colors text-white" />
                  <button onClick={() => setFToken(genToken())} title="Generate"
                          className="px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                {fToken && (
                  <p className="text-[10px] text-slate-600 mt-1">
                    Table: <span className="font-mono text-slate-500">{fToken}_registered_devices</span>
                  </p>
                )}
              </div>
            </div>

            {/* PAT field */}
            <div className="mb-4">
              <label className="text-xs text-slate-500 mb-1.5 flex items-center gap-1.5 font-medium">
                <Key className="w-3 h-3" />
                Supabase PAT
                {fPat && <span className="text-emerald-500 text-[10px]">✓ saved</span>}
              </label>
              <input
                type="password"
                value={fPat}
                onChange={(e) => setFPat(e.target.value)}
                placeholder="sbp_xxxxxxxxxxxx (setup se auto-fill hota hai)"
                className="w-full bg-[#0a0e1a] border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm font-mono placeholder-slate-700 focus:outline-none focus:border-blue-500/60 transition-colors text-white"
              />
            </div>

            {createMsg && (
              <div className="flex items-center gap-2 bg-blue-900/20 border border-blue-800/40 rounded-xl px-4 py-3 mb-3 text-xs text-blue-400">
                <span className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
                {createMsg}
              </div>
            )}
            {createErr && (
              <div className="text-xs text-red-400 bg-red-900/15 border border-red-800/30 rounded-xl px-4 py-3 mb-3">
                {createErr}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating || !fToken.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                {creating ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</>
                ) : (
                  <><CheckCircle className="w-3.5 h-3.5" />Create App</>
                )}
              </button>
              <button onClick={() => setShowForm(false)}
                      className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-400 bg-red-900/10 border border-red-800/30 rounded-xl px-4 py-3">{error}</div>
        )}

        {/* Apps list */}
        {loading && apps.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-slate-600">
            <span className="w-4 h-4 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mr-2" />
            <span className="text-sm">Load ho raha hai…</span>
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center py-20 bg-[#0d1220] border border-slate-800 rounded-2xl">
            <Smartphone className="w-8 h-8 mx-auto text-slate-700 mb-3" />
            <p className="text-sm text-slate-600">Koi app nahi. "New App" dabao.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {apps.map((app) => {
              const ktText = getConstantsKt(app.token);
              const showKt = ktId === app.id;
              return (
                <div key={app.id} className="bg-[#0d1220] border border-slate-800/80 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${app.is_active ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-slate-600"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-white truncate">{app.label || app.token}</p>
                        <Badge variant={app.is_active ? "active" : "inactive"} />
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-mono text-xs text-blue-300 bg-blue-900/20 px-2 py-0.5 rounded">
                          {app.token}
                        </span>
                        <span className="text-xs text-slate-600">
                          {new Date(app.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Fix Realtime — no PAT needed */}
                      <button
                        onClick={() => void handleFixRealtime(app)}
                        disabled={fixingRtId === app.id}
                        title="Enable Live Realtime (1-click, no PAT needed)"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-900/25 hover:bg-violet-900/45 text-violet-400 text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {fixingRtId === app.id
                          ? <span className="w-3 h-3 border border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                          : <Radio className="w-3 h-3" />}
                        <span className="hidden sm:inline">Live</span>
                      </button>

                      <button onClick={() => handleToggle(app)} title={app.is_active ? "Disable" : "Enable"}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                app.is_active
                                  ? "bg-emerald-900/25 text-emerald-400 hover:bg-red-900/25 hover:text-red-400"
                                  : "bg-slate-800 text-slate-500 hover:bg-emerald-900/25 hover:text-emerald-400"
                              }`}>
                        {app.is_active ? <><Power className="w-3 h-3" /><span className="hidden sm:inline">Active</span></>
                                       : <><PowerOff className="w-3 h-3" /><span className="hidden sm:inline">Inactive</span></>}
                      </button>

                      <button onClick={() => setKtId(showKt ? null : app.id)} title="Constants.kt"
                              className={`p-1.5 rounded-lg transition-colors ${showKt ? "bg-blue-900/30 text-blue-400" : "hover:bg-slate-800 text-slate-500 hover:text-white"}`}>
                        <Smartphone className="w-3.5 h-3.5" />
                      </button>

                      <button onClick={() => handleDelete(app.id)} title="Delete"
                              className="p-1.5 rounded-lg hover:bg-red-900/25 text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {rtMsg?.id === app.id && (
                    <div className={`mx-4 mb-3 px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between ${
                      rtMsg.ok ? "bg-violet-900/20 text-violet-300 border border-violet-800/40"
                               : "bg-red-900/20 text-red-400 border border-red-800/40"
                    }`}>
                      <span>{rtMsg.text}</span>
                      <button onClick={() => setRtMsg(null)} className="ml-2 opacity-60 hover:opacity-100">×</button>
                    </div>
                  )}

                  {showKt && (
                    <div className="border-t border-slate-800/60 bg-[#080c16] px-4 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500">Android — Constants.kt</span>
                        <button onClick={() => copy(ktText, `kt-${app.id}`)}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors">
                          {copiedId === `kt-${app.id}`
                            ? <><CheckCircle className="w-3 h-3 text-emerald-400" />Copied!</>
                            : <><Copy className="w-3 h-3" />Copy</>}
                        </button>
                      </div>
                      <pre className="bg-[#0d1117] border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
                        {ktText}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
