import { useState, useEffect, useCallback } from "react";
import {
  Plus, Copy, CheckCircle, Trash2, Power, PowerOff,
  Key, RefreshCw, ChevronDown, ChevronUp, Smartphone, X
} from "lucide-react";
import {
  getTokens, createToken, toggleToken, deleteToken,
  genToken, getConstantsKt, AdminToken
} from "@/lib/supabase";

export default function Home() {
  const [tokens, setTokens] = useState<AdminToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newToken, setNewToken] = useState(genToken());
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createStep, setCreateStep] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTokens(await getTokens());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreate = async () => {
    const tok = newToken.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!tok) return;
    setCreating(true);
    setCreateError("");
    try {
      setCreateStep("Supabase table bana raha hoon...");
      const created = await createToken(tok, newLabel.trim());
      setTokens((prev) => [created, ...prev]);
      setShowCreate(false);
      setExpandedId(created.id);
      setNewToken(genToken());
      setNewLabel("");
      setCreateStep("");
    } catch (e: unknown) {
      setCreateStep("");
      setCreateError(e instanceof Error ? e.message : "Create error");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (t: AdminToken) => {
    try {
      await toggleToken(t.id, !t.is_active);
      setTokens((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, is_active: !t.is_active } : x))
      );
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Toggle error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Ye token permanently delete karo?")) return;
    try {
      await deleteToken(id);
      setTokens((prev) => prev.filter((x) => x.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Delete error");
    }
  };

  const activeCount = tokens.filter((t) => t.is_active).length;

  return (
    <div className="min-h-screen bg-[#080c16] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-800/80 bg-[#0b0f1c]/90 backdrop-blur">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Key className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-sm">Admin Token Manager</span>
            <span className="hidden sm:inline text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
              {activeCount} active / {tokens.length} total
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => { setShowCreate(true); setCreateError(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New App</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-5 space-y-3">

        {/* Create Modal */}
        {showCreate && (
          <div className="bg-[#0f1929] border border-blue-500/30 rounded-2xl p-5 shadow-xl shadow-blue-900/10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4 text-blue-400" />
                Naya App Banao
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* App Name */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">
                  App Name <span className="text-slate-600">(label)</span>
                </label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. RTO App Delhi"
                  autoFocus
                  className="w-full bg-[#0a0e1a] border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/70 transition-colors"
                />
              </div>

              {/* App ID */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">
                  App ID <span className="text-slate-600">(Android mein use hoga)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    value={newToken}
                    onChange={(e) =>
                      setNewToken(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))
                    }
                    placeholder="e.g. rto27"
                    className="flex-1 bg-[#0a0e1a] border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500/70 transition-colors"
                  />
                  <button
                    onClick={() => setNewToken(genToken())}
                    title="Random ID generate karo"
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-slate-600">
                  Lowercase letters aur numbers only. Table naam:{" "}
                  <span className="font-mono text-slate-500">
                    {newToken || "…"}_registered_devices
                  </span>
                </p>
              </div>

              {/* Status */}
              {creating && createStep && (
                <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-900/20 border border-blue-800/40 rounded-xl px-4 py-3">
                  <span className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
                  {createStep}
                </div>
              )}

              {createError && (
                <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3">
                  {createError}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newToken.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
                >
                  {creating ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Bana raha hoon...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Save & Create
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Token List */}
        {loading && tokens.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-slate-600">
            <span className="w-4 h-4 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mr-2" />
            <span className="text-sm">Load ho raha hai...</span>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-sm mb-2">{error}</p>
            <button onClick={load} className="text-xs text-blue-400 hover:text-blue-300">
              Dobara try karo
            </button>
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-20 text-slate-600">
            <Key className="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Koi app nahi. "New App" dabao.</p>
          </div>
        ) : (
          tokens.map((t) => {
            const expanded = expandedId === t.id;
            const dateStr = new Date(t.created_at).toLocaleDateString("en-IN", {
              day: "numeric", month: "short", year: "numeric",
            });
            return (
              <div
                key={t.id}
                className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                  expanded
                    ? "border-blue-500/30 bg-[#0f1929]"
                    : t.is_active
                    ? "border-slate-700/50 bg-[#0d1220] hover:border-slate-600/60"
                    : "border-slate-800/40 bg-[#0a0d18] opacity-55"
                }`}
              >
                {/* Row */}
                <div className="px-4 py-3.5 flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${
                      t.is_active ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-slate-600"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    {t.label && (
                      <p className="text-sm font-medium text-white truncate">{t.label}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-xs text-blue-300 bg-blue-900/25 px-1.5 py-0.5 rounded">
                        {t.token}
                      </span>
                      <span className="text-xs text-slate-600">{dateStr}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {/* Toggle active */}
                    <button
                      onClick={() => handleToggle(t)}
                      title={t.is_active ? "Disable karo" : "Enable karo"}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        t.is_active
                          ? "bg-emerald-900/30 text-emerald-400 hover:bg-red-900/30 hover:text-red-400"
                          : "bg-slate-800 text-slate-500 hover:bg-emerald-900/30 hover:text-emerald-400"
                      }`}
                    >
                      {t.is_active ? (
                        <><Power className="w-3 h-3" /><span className="hidden sm:inline">Active</span></>
                      ) : (
                        <><PowerOff className="w-3 h-3" /><span className="hidden sm:inline">Inactive</span></>
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(t.id)}
                      title="Delete"
                      className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Expand */}
                    <button
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"
                    >
                      {expanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded: Android config */}
                {expanded && (
                  <div className="border-t border-slate-700/40 px-4 py-4 bg-[#080c16]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                        Android Constants.kt — copy karke paste karo
                      </span>
                      <button
                        onClick={() => copy(getConstantsKt(t.token), `kt-${t.id}`)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                      >
                        {copiedKey === `kt-${t.id}` ? (
                          <><CheckCircle className="w-3 h-3 text-emerald-400" /> Copied!</>
                        ) : (
                          <><Copy className="w-3 h-3" /> Copy</>
                        )}
                      </button>
                    </div>
                    <pre className="bg-[#0d1117] border border-slate-700/30 rounded-xl p-3.5 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed whitespace-pre">
                      {getConstantsKt(t.token)}
                    </pre>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="bg-[#0d1220] border border-slate-800 rounded-xl p-3 text-xs">
                        <p className="text-slate-500 mb-1">Table naam</p>
                        <p className="font-mono text-slate-300">{t.token}_registered_devices</p>
                      </div>
                      <div className="bg-[#0d1220] border border-slate-800 rounded-xl p-3 text-xs">
                        <p className="text-slate-500 mb-1">Status</p>
                        <p className={t.is_active ? "text-emerald-400" : "text-slate-500"}>
                          {t.is_active ? "✓ Active" : "✗ Inactive"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
