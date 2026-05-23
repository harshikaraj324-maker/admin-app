import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Power, PowerOff, RefreshCw,
  Smartphone, Copy, CheckCircle, X, Key, Radio, Search
} from "lucide-react";
import Badge from "@/components/Badge";
import type { AdminApp } from "@/lib/types";
import {
  getApps, createApp, updateApp, deleteApp,
  genToken, getConstantsKt, getPat, savePat,
  fixRealtime, fetchServerPat,
} from "@/lib/supabase";

export default function Apps() {
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

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
  const [rtPatId, setRtPatId] = useState<string | null>(null);
  const [rtPat, setRtPat] = useState("");
  const [rtMsg, setRtMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setApps(await getApps()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    fetchServerPat().then((pat) => {
      if (pat) { savePat(pat); setFPat(pat); }
    });
  }, [load]);

  const openForm = () => {
    const stored = getPat();
    setFPat(stored);
    setFToken(genToken());
    setFLabel("");
    setCreateErr("");
    setCreateMsg("");
    setShowForm(true);
    if (!stored) {
      fetchServerPat().then((pat) => {
        if (pat) { savePat(pat); setFPat(pat); }
      });
    }
  };

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = async () => {
    const raw = fToken.trim();
    const tok = raw.toLowerCase().replace(/[^a-z0-9_]/g, "").replace(/^_+|_+$/g, "");
    if (!tok) return;
    if (!fPat.trim()) { setCreateErr("Supabase PAT is required"); return; }
    setCreating(true); setCreateErr(""); setCreateMsg("Creating table in Supabase…");
    try {
      savePat(fPat.trim());
      const a = await createApp(tok, fLabel.trim() || raw, fPat.trim());
      setApps((p) => [a, ...p]);
      setShowForm(false); setCreateMsg("");
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
    if (!confirm("Delete this app? You will need to remove the device table from Supabase manually.")) return;
    try { await deleteApp(id); setApps((p) => p.filter((a) => a.id !== id)); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : "Error"); }
  };

  const handleFixRealtime = async (app: AdminApp) => {
    if (!rtPat.trim()) return;
    setFixingRtId(app.id); setRtMsg(null);
    try {
      await fixRealtime(app.token, rtPat.trim());
      setRtPatId(null); setRtPat("");
      setRtMsg({ id: app.id, ok: true, text: "Realtime enabled! Live data is now active." });
    } catch (e: unknown) {
      setRtMsg({ id: app.id, ok: false, text: e instanceof Error ? e.message : "Fix failed" });
    } finally {
      setFixingRtId(null);
      setTimeout(() => setRtMsg(null), 8000);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? apps.filter((a) => a.token.toLowerCase().includes(q) || (a.label ?? "").toLowerCase().includes(q))
    : apps;

  return (
    <div className="flex-1 overflow-auto h-full bg-[#080c16]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-[#080c16]/90 backdrop-blur border-b border-slate-800/60 h-14 flex items-center justify-between px-4 sm:px-6">
        <div>
          <h1 className="text-sm font-semibold text-white">Applications</h1>
          <p className="text-xs text-slate-600">{apps.length} registered</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={openForm}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs sm:text-sm font-medium transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span>New App</span>
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">

        {/* Search bar */}
        {apps.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by App ID or name…"
              className="w-full bg-[#0d1220] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm placeholder-slate-700 focus:outline-none focus:border-blue-500/50 text-white transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <div className="bg-[#0d1220] border border-blue-500/25 rounded-2xl p-4 sm:p-5 shadow-xl shadow-blue-900/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Create New App</h2>
              <button onClick={() => setShowForm(false)}
                      className="p-1 rounded-lg hover:bg-slate-800 text-slate-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block font-medium">App Name (optional)</label>
                <input value={fLabel} onChange={(e) => setFLabel(e.target.value)}
                       placeholder="e.g. Main App"
                       className="w-full bg-[#0a0e1a] border border-slate-700/80 rounded-xl px-3 py-2.5 text-sm placeholder-slate-700 focus:outline-none focus:border-blue-500/60 transition-colors text-white" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block font-medium">App ID</label>
                <div className="flex gap-2">
                  <input value={fToken}
                         onChange={(e) => setFToken(e.target.value.toUpperCase().replace(/[^A-Z0-9\-_]/g, ""))}
                         placeholder="GHOST-4K2M3P"
                         className="flex-1 bg-[#0a0e1a] border border-slate-700/80 rounded-xl px-3 py-2.5 text-sm font-mono placeholder-slate-700 focus:outline-none focus:border-blue-500/60 transition-colors text-white tracking-wider" />
                  <button onClick={() => setFToken(genToken())} title="Generate new ID"
                          className="px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                {fToken && (
                  <p className="text-[10px] text-slate-600 mt-1 truncate">
                    Table: <span className="font-mono text-slate-500">
                      {fToken.toLowerCase().replace(/[^a-z0-9_]/g, "").replace(/^_+|_+$/g, "")}_registered_devices
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="mb-3">
              <label className="text-xs text-slate-500 mb-1.5 flex items-center gap-1.5 font-medium">
                <Key className="w-3 h-3" />
                Supabase PAT
                {fPat && <span className="text-emerald-500 text-[10px]">✓ loaded</span>}
              </label>
              <input
                type="password"
                value={fPat}
                onChange={(e) => setFPat(e.target.value)}
                placeholder="sbp_xxxxxxxxxxxx"
                autoComplete="off"
                className="w-full bg-[#0a0e1a] border border-slate-700/80 rounded-xl px-3 py-2.5 text-sm font-mono placeholder-slate-700 focus:outline-none focus:border-blue-500/60 transition-colors text-white"
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
              <button onClick={() => void handleCreate()} disabled={creating || !fToken.trim()}
                      className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                {creating ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</>
                ) : (
                  <><CheckCircle className="w-3.5 h-3.5" />Create App</>
                )}
              </button>
              <button onClick={() => setShowForm(false)}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-900/10 border border-red-800/30 rounded-xl px-4 py-3">{error}</div>
        )}

        {loading && apps.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-slate-600">
            <span className="w-4 h-4 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : filtered.length === 0 && search ? (
          <div className="text-center py-12 bg-[#0d1220] border border-slate-800 rounded-2xl">
            <Search className="w-7 h-7 mx-auto text-slate-700 mb-2" />
            <p className="text-sm text-slate-600">No results for "{search}"</p>
            <button onClick={() => setSearch("")} className="text-xs text-blue-500 hover:text-blue-400 mt-1">Clear search</button>
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center py-16 bg-[#0d1220] border border-slate-800 rounded-2xl">
            <Smartphone className="w-8 h-8 mx-auto text-slate-700 mb-3" />
            <p className="text-sm text-slate-600">No apps yet. Click "New App" to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((app) => {
              const ktText = getConstantsKt(app.token);
              const showKt = ktId === app.id;
              return (
                <div key={app.id} className="bg-[#0d1220] border border-slate-800/80 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2.5 px-3 sm:px-4 py-3">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${app.is_active ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-slate-600"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-white truncate max-w-[140px] sm:max-w-none">{app.label || app.token}</p>
                        <Badge variant={app.is_active ? "active" : "inactive"} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="font-mono text-xs text-blue-300 bg-blue-900/20 px-2 py-0.5 rounded tracking-wide">
                          {app.token}
                        </span>
                        <span className="text-xs text-slate-600 hidden sm:inline">
                          {new Date(app.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setRtPatId(rtPatId === app.id ? null : app.id); setRtPat(getPat()); setRtMsg(null); }}
                        title="Enable Supabase Realtime"
                        className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                          rtPatId === app.id
                            ? "bg-violet-700/40 text-violet-300"
                            : "bg-violet-900/25 hover:bg-violet-900/45 text-violet-400"
                        }`}
                      >
                        <Radio className="w-3.5 h-3.5" />
                      </button>

                      <button onClick={() => void handleToggle(app)} title={app.is_active ? "Disable" : "Enable"}
                              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                                app.is_active
                                  ? "bg-emerald-900/25 text-emerald-400 hover:bg-red-900/25 hover:text-red-400"
                                  : "bg-slate-800 text-slate-500 hover:bg-emerald-900/25 hover:text-emerald-400"
                              }`}>
                        {app.is_active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                      </button>

                      <button onClick={() => setKtId(showKt ? null : app.id)} title="Constants.kt"
                              className={`p-1.5 rounded-lg transition-colors ${showKt ? "bg-blue-900/30 text-blue-400" : "hover:bg-slate-800 text-slate-500 hover:text-white"}`}>
                        <Smartphone className="w-3.5 h-3.5" />
                      </button>

                      <button onClick={() => void handleDelete(app.id)} title="Delete"
                              className="p-1.5 rounded-lg hover:bg-red-900/25 text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {rtPatId === app.id && (
                    <div className="mx-3 sm:mx-4 mb-3 border border-violet-800/40 rounded-xl bg-violet-950/20 px-3 py-3">
                      <p className="text-xs text-violet-300 mb-2 font-medium">
                        Supabase PAT required —{" "}
                        <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer" className="underline opacity-70 hover:opacity-100">generate here</a>
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={rtPat}
                          onChange={(e) => setRtPat(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && void handleFixRealtime(app)}
                          placeholder="sbp_..."
                          autoComplete="off"
                          className="flex-1 bg-[#0d1220] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-600"
                          autoFocus
                        />
                        <button
                          onClick={() => void handleFixRealtime(app)}
                          disabled={fixingRtId === app.id || !rtPat.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-xs font-medium transition-colors disabled:opacity-40"
                        >
                          {fixingRtId === app.id
                            ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                            : <Radio className="w-3 h-3" />}
                          Enable
                        </button>
                      </div>
                    </div>
                  )}

                  {rtMsg?.id === app.id && (
                    <div className={`mx-3 sm:mx-4 mb-3 px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between ${
                      rtMsg.ok ? "bg-violet-900/20 text-violet-300 border border-violet-800/40"
                               : "bg-red-900/20 text-red-400 border border-red-800/40"
                    }`}>
                      <span className="truncate">{rtMsg.text}</span>
                      <button onClick={() => setRtMsg(null)} className="ml-2 opacity-60 hover:opacity-100 flex-shrink-0">×</button>
                    </div>
                  )}

                  {showKt && (
                    <div className="border-t border-slate-800/60 bg-[#080c16] px-3 sm:px-4 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500">Android — Constants.kt</span>
                        <button onClick={() => void copy(ktText, `kt-${app.id}`)}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors">
                          {copiedId === `kt-${app.id}`
                            ? <><CheckCircle className="w-3 h-3 text-emerald-400" />Copied!</>
                            : <><Copy className="w-3 h-3" />Copy</>}
                        </button>
                      </div>
                      <pre className="bg-[#0d1117] border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
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
