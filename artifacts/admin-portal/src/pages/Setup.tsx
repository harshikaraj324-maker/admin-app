import { useState } from "react";
import { CheckCircle, Copy, ExternalLink, Database } from "lucide-react";
import { getSetupSQL, checkSetupDone } from "@/lib/supabase";

interface SetupProps {
  onDone: () => void;
}

export default function Setup({ onDone }: SetupProps) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const sql = getSetupSQL();

  const copySQL = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verify = async () => {
    setChecking(true);
    setError("");
    try {
      const ok = await checkSetupDone();
      if (ok) {
        onDone();
      } else {
        setError("Table abhi bhi nahi mili. Supabase SQL Editor mein SQL chalao phir try karo.");
      }
    } catch {
      setError("Connection error. Supabase URL aur Key check karo.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Admin Portal Setup</h1>
            <p className="text-sm text-slate-400">Pehli baar Supabase DB configure karo</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#111827] border border-slate-700/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-xs flex items-center justify-center font-bold">1</span>
                <span className="font-medium">Supabase SQL Editor kholke ye SQL chalao</span>
              </div>
              <a
                href="https://supabase.com/dashboard/project/imfwqoocwfvvtjghgofi/sql/new"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                SQL Editor kholein <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <pre className="bg-[#0d1117] border border-slate-700/40 rounded-lg p-4 text-xs text-slate-300 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {sql}
              </pre>
              <button
                onClick={copySQL}
                className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs transition-colors"
              >
                {copied ? (
                  <><CheckCircle className="w-3 h-3 text-green-400" /> Copied!</>
                ) : (
                  <><Copy className="w-3 h-3" /> Copy</>
                )}
              </button>
            </div>
          </div>

          <div className="bg-[#111827] border border-slate-700/50 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-xs flex items-center justify-center font-bold">2</span>
              <span className="font-medium">SQL chalane ke baad verify karo</span>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Supabase dashboard mein SQL run karo, phir niche "Setup Done" dabao.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={verify}
              disabled={checking}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center justify-center gap-2"
            >
              {checking ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Verify kar raha hoon...</>
              ) : (
                <><CheckCircle className="w-4 h-4" /> Setup Done — Dashboard kholein</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
