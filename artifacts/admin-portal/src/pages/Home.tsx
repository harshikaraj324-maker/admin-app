import { useState, useEffect, useCallback } from "react";
import {
  Plus, Copy, CheckCircle, Trash2, Power, PowerOff,
  Key, RefreshCw, ChevronDown, ChevronUp, Code2, Database,
  Smartphone
} from "lucide-react";
import {
  getTokens, createToken, toggleToken, deleteToken,
  genToken, getDeviceTableSQL, getConstantsKt,
  AdminToken
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

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [codeTab, setCodeTab] = useState<"constants" | "sql">("constants");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getTokens();
      setTokens(data);
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
    if (!newToken.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const created = await createToken(newToken.trim().toLowerCase(), newLabel.trim());
      setTokens((prev) => [created, ...prev]);
      setShowCreate(false);
      setExpandedId(created.id);
      setNewToken(genToken());
      setNewLabel("");
    } catch (e: unknown) {
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
    if (!confirm("Ye token delete karo?")) return;
    try {
      await deleteToken(id);
      setTokens((prev) => prev.filter((x) => x.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Delete error");
    }
  };

  const activeCount = tokens.filter((t) => t.is_active).length;

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="border-b border-slate-800 bg-[#0d1220]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">Admin Token Manager</h1>
              <p className="text-xs text-slate-500">Supabase: imfwqoocwfvvtjghgofi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 bg-slate-800 px-2.5 py-1 rounded-full">
              {activeCount} active / {tokens.length} total
            </span>
            <button
              onClick={load}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowCreate((s) => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> New Token
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {showCreate && (
          <div className="bg-[#111827] border border-blue-600/30 rounded-xl p-5 space-y-4">
            <h2 className="font-medium flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-400" /> Naya Token Banao
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">App ID / Token</label>
                <div className="flex gap-2">
                  <input
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                    placeholder="e.g. rto27"
                    className="flex-1 bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => setNewToken(genToken())}
                    className="px-2.5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs transition-colors"
                    title="Random generate karo"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Label (optional)</label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. RTO App Delhi"
                  className="w-full bg-[#0d1117] border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {createError && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-700/40 px-3 py-2 rounded-lg">
                {createError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newToken}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {creating ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Bana raha hoon...</>
                ) : (
                  <><CheckCircle className="w-3.5 h-3.5" /> Token Banao</>
                )}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <span className="w-5 h-5 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin mr-2" />
            Load ho raha hai...
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button onClick={load} className="text-xs text-blue-400 hover:text-blue-300">
              Dobara try karo
            </button>
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Key className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Koi token nahi. "New Token" dabao.</p>
          </div>
        ) : (
          tokens.map((t) => {
            const expanded = expandedId === t.id;
            const dateStr = new Date(t.created_at).toLocaleDateString("en-IN", {
              day: "numeric", month: "short", year: "numeric"
            });

            return (
              <div
                key={t.id}
                className={`bg-[#111827] border rounded-xl overflow-hidden transition-all ${
                  t.is_active ? "border-slate-700/50" : "border-slate-800/50 opacity-60"
                }`}
              >
                <div className="px-5 py-4 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.is_active ? "bg-green-400" : "bg-slate-600"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm text-blue-300">{t.token}</span>
                      {t.label && <span className="text-xs text-slate-400 truncate">{t.label}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Created: {dateStr}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copy(t.token, `tok-${t.id}`)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      title="Token copy karo"
                    >
                      {copiedKey === `tok-${t.id}` ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleToggle(t)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                      title={t.is_active ? "Deactivate" : "Activate"}
                    >
                      {t.is_active ? (
                        <Power className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <PowerOff className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete karo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    >
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-slate-700/50 px-5 py-4 space-y-3 bg-[#0d1117]">
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => setCodeTab("constants")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          codeTab === "constants"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <Smartphone className="w-3 h-3" /> Android Constants.kt
                      </button>
                      <button
                        onClick={() => setCodeTab("sql")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          codeTab === "sql"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        <Database className="w-3 h-3" /> Table SQL
                      </button>
                    </div>

                    {codeTab === "constants" ? (
                      <div className="relative">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Code2 className="w-3 h-3" /> Constants.kt mein ye paste karo
                          </span>
                          <button
                            onClick={() => copy(getConstantsKt(t.token), `kt-${t.id}`)}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                          >
                            {copiedKey === `kt-${t.id}` ? (
                              <><CheckCircle className="w-3 h-3 text-green-400" /> Copied!</>
                            ) : (
                              <><Copy className="w-3 h-3" /> Copy</>
                            )}
                          </button>
                        </div>
                        <pre className="bg-[#161b2e] border border-slate-700/40 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre leading-relaxed">
                          {getConstantsKt(t.token)}
                        </pre>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Database className="w-3 h-3" /> Supabase SQL Editor mein chalao
                          </span>
                          <button
                            onClick={() => copy(getDeviceTableSQL(t.token), `sql-${t.id}`)}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                          >
                            {copiedKey === `sql-${t.id}` ? (
                              <><CheckCircle className="w-3 h-3 text-green-400" /> Copied!</>
                            ) : (
                              <><Copy className="w-3 h-3" /> Copy</>
                            )}
                          </button>
                        </div>
                        <pre className="bg-[#161b2e] border border-slate-700/40 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre leading-relaxed">
                          {getDeviceTableSQL(t.token)}
                        </pre>
                        <a
                          href="https://supabase.com/dashboard/project/imfwqoocwfvvtjghgofi/sql/new"
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          SQL Editor kholein →
                        </a>
                      </div>
                    )}
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
