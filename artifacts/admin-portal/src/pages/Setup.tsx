import { useState } from "react";
import { Shield, CheckCircle, AlertCircle, Zap, Eye, EyeOff, ExternalLink } from "lucide-react";
import { runSetup, savePat } from "@/lib/supabase";

interface SetupProps { onDone: () => void; }

export default function Setup({ onDone }: SetupProps) {
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [step, setStep] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const run = async () => {
    if (!pat.trim()) { setMsg("Please enter your Supabase PAT"); return; }
    setStep("running"); setMsg("");
    try {
      await runSetup(pat.trim());
      savePat(pat.trim());
      setStep("done");
      setTimeout(onDone, 1200);
    } catch (e: unknown) {
      setStep("error");
      setMsg(e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <div className="min-h-screen bg-[#080c16] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-all ${
            step === "done" ? "bg-emerald-600/20 border border-emerald-500/30" : "bg-blue-600/20 border border-blue-500/30"
          }`}>
            {step === "done"
              ? <CheckCircle className="w-8 h-8 text-emerald-400" />
              : <Shield className="w-8 h-8 text-blue-400" />}
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Initial Setup</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Enter your Supabase PAT once — tables will be created automatically.<br />
            This token will also be used when creating new apps.
          </p>
        </div>

        <div className="bg-[#0d1220] border border-slate-800 rounded-2xl p-5 mb-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Supabase Personal Access Token
              </label>
              <a
                href="https://supabase.com/dashboard/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Generate token <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="relative">
              <input
                type={showPat ? "text" : "password"}
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void run()}
                placeholder="sbp_xxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
                className="w-full bg-[#0a0e1a] border border-slate-700/80 rounded-xl px-4 py-3 pr-10 text-sm font-mono placeholder-slate-700 focus:outline-none focus:border-blue-500/60 transition-colors text-white"
              />
              <button
                type="button"
                onClick={() => setShowPat((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
              >
                {showPat ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-600 mt-1.5">
              supabase.com/dashboard/account/tokens → "Generate new token"
            </p>
          </div>

          <div className="pt-1 border-t border-slate-800/60 space-y-2">
            {[
              "Creates admin_tokens table",
              "Sets up device table auto-create function",
              "Configures RLS policies (service_role access)",
              "Token is saved only in this browser's local storage",
            ].map((txt, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-2.5 h-2.5 text-blue-400" />
                </div>
                <p className="text-xs text-slate-500">{txt}</p>
              </div>
            ))}
          </div>
        </div>

        {step === "error" && msg && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 break-all">{msg}</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-4">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <p className="text-sm text-emerald-400 font-medium">Setup complete! Loading dashboard…</p>
          </div>
        )}

        <button
          onClick={() => void run()}
          disabled={step === "running" || step === "done" || !pat.trim()}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          {step === "running" ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Setting up…
            </>
          ) : step === "done" ? (
            <><CheckCircle className="w-4 h-4" />Done!</>
          ) : (
            "Initialize →"
          )}
        </button>

        {step === "error" && (
          <button onClick={() => void run()} className="w-full mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
