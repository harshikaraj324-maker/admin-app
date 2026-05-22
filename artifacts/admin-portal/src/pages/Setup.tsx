import { useState } from "react";
import { CheckCircle, Copy, ExternalLink, Zap, Database } from "lucide-react";
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
    setTimeout(() => setCopied(false), 2500);
  };

  const verify = async () => {
    setChecking(true);
    setError("");
    try {
      const ok = await checkSetupDone();
      if (ok) {
        onDone();
      } else {
        setError(
          "Table abhi bhi nahi mili. Supabase SQL Editor mein SQL chalao, phir dobara try karo."
        );
      }
    } catch {
      setError("Connection error. Supabase credentials check karo.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080c16] text-white flex items-center justify-center p-5">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Ek Baar Setup Karo</h1>
            <p className="text-sm text-slate-500">
              Ye SQL ek baar chalao — uske baad sab automatic ho jaayega
            </p>
          </div>
        </div>

        {/* Highlight banner */}
        <div className="flex items-start gap-3 bg-blue-900/20 border border-blue-700/30 rounded-2xl px-4 py-3.5 mb-5">
          <Zap className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-200 leading-relaxed">
            Ye SQL sirf <strong>ek baar</strong> run karna hai. Uske baad jab bhi naya token
            banaaoge — table <strong>automatically create</strong> ho jaayegi, baar baar SQL
            editor kholna nahi padega.
          </p>
        </div>

        {/* SQL block */}
        <div className="bg-[#0d1220] border border-slate-700/50 rounded-2xl overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
            <span className="text-xs font-medium text-slate-400">Setup SQL</span>
            <div className="flex items-center gap-2">
              <a
                href="https://supabase.com/dashboard/project/imfwqoocwfvvtjghgofi/sql/new"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                SQL Editor <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={copySQL}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs transition-colors"
              >
                {copied ? (
                  <><CheckCircle className="w-3 h-3 text-emerald-400" /> Copied!</>
                ) : (
                  <><Copy className="w-3 h-3" /> Copy SQL</>
                )}
              </button>
            </div>
          </div>
          <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed whitespace-pre max-h-72 overflow-y-auto">
            {sql}
          </pre>
        </div>

        {/* Instructions */}
        <ol className="space-y-2 mb-5">
          {[
            <>Upar "Copy SQL" dabao</>,
            <>
              <a
                href="https://supabase.com/dashboard/project/imfwqoocwfvvtjghgofi/sql/new"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                Supabase SQL Editor
              </a>{" "}
              kholein aur paste karke Run karein
            </>,
            <>Niche "Setup Complete" dabao</>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-400">
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-medium">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-900/25 border border-red-700/40 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={verify}
          disabled={checking}
          className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {checking ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Verify ho raha hai...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Setup Complete — Dashboard kholein
            </>
          )}
        </button>
      </div>
    </div>
  );
}
