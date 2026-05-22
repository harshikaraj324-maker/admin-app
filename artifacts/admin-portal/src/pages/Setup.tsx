import { useState } from "react";
import { Shield, CheckCircle, AlertCircle, Zap } from "lucide-react";
import { runSetup } from "@/lib/supabase";

interface SetupProps { onDone: () => void; }

export default function Setup({ onDone }: SetupProps) {
  const [step, setStep] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const run = async () => {
    setStep("running"); setMsg("");
    try {
      await runSetup();
      setStep("done");
      setTimeout(onDone, 1000);
    } catch (e: unknown) {
      setStep("error");
      setMsg(e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <div className="min-h-screen bg-[#080c16] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-all ${
          step === "done" ? "bg-emerald-600/20 border border-emerald-500/30" : "bg-blue-600/20 border border-blue-500/30"
        }`}>
          {step === "done"
            ? <CheckCircle className="w-8 h-8 text-emerald-400" />
            : <Shield className="w-8 h-8 text-blue-400" />}
        </div>

        <h1 className="text-xl font-bold text-white mb-2">Pehli Baar Setup</h1>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">
          Ek click mein Supabase initialize ho jaayega.<br />
          Koi SQL editor, koi manual kaam nahi.
        </p>

        {/* Info cards */}
        <div className="bg-[#0d1220] border border-slate-800 rounded-2xl p-4 mb-6 space-y-2.5 text-left">
          {[
            "admin_tokens table create hogi",
            "Device tables auto-create function setup hogi",
            "RLS policies set honge",
            "Sab kuch backend se — koi secret frontend tak nahi jaayega",
          ].map((txt, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <Zap className="w-2.5 h-2.5 text-blue-400" />
              </div>
              <p className="text-xs text-slate-400">{txt}</p>
            </div>
          ))}
        </div>

        {/* Error */}
        {step === "error" && msg && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4 text-left">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-400 break-all">{msg}</p>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-4">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <p className="text-sm text-emerald-400 font-medium">Setup complete! Dashboard khul raha hai…</p>
          </div>
        )}

        {/* Button */}
        <button
          onClick={run}
          disabled={step === "running" || step === "done"}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          {step === "running" ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Initialize ho raha hai…
            </>
          ) : step === "done" ? (
            <><CheckCircle className="w-4 h-4" />Done!</>
          ) : (
            "Initialize Karo — Ek Click Mein →"
          )}
        </button>

        {step === "error" && (
          <button onClick={run} className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            Dobara try karo
          </button>
        )}
      </div>
    </div>
  );
}
