import { useState } from "react";
import { Shield, ExternalLink, Eye, EyeOff, CheckCircle, AlertCircle, Key } from "lucide-react";
import { runSetupWithPAT, checkSetupDone } from "@/lib/supabase";

interface SetupProps { onDone: () => void; }

export default function Setup({ onDone }: SetupProps) {
  const [pat, setPat] = useState("");
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<"idle" | "running" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  const run = async () => {
    if (!pat.trim()) { setMsg("Personal Access Token dalo."); setStep("error"); return; }
    setStep("running"); setMsg("");
    try {
      await runSetupWithPAT(pat.trim());
      const ok = await checkSetupDone();
      if (!ok) throw new Error("Tables verify nahi huyi. Dobara try karo.");
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
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Pehli Baar Setup</h1>
          <p className="text-slate-500 text-sm mt-2">
            Ek baar karo — uske baad sab automatic
          </p>
        </div>

        {/* Steps */}
        <div className="bg-[#0d1220] border border-slate-800 rounded-2xl p-5 mb-5 space-y-3">
          {[
            { n: 1, text: "Supabase Dashboard kholein", link: "https://supabase.com/dashboard/account/tokens", linkText: "Account → Access Tokens" },
            { n: 2, text: "\"Generate new token\" dabao, copy karo" },
            { n: 3, text: "Niche paste karo → Initialize dabao" },
          ].map(({ n, text, link, linkText }) => (
            <div key={n} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-semibold">{n}</span>
              <p className="text-sm text-slate-400">
                {text}{" "}
                {link && (
                  <a href={link} target="_blank" rel="noreferrer"
                     className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5">
                    {linkText} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </p>
            </div>
          ))}
        </div>

        {/* PAT input */}
        <div className="relative mb-3">
          <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
          <input
            type={show ? "text" : "password"}
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full bg-[#0d1220] border border-slate-700 rounded-xl pl-10 pr-10 py-3 text-sm font-mono text-slate-300 placeholder-slate-700 focus:outline-none focus:border-blue-500/60 transition-colors"
          />
          <button onClick={() => setShow(!show)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Message */}
        {step === "error" && msg && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{msg}</p>
          </div>
        )}
        {step === "done" && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-3">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <p className="text-sm text-emerald-400">Setup complete! Dashboard khul raha hai…</p>
          </div>
        )}

        {/* Button */}
        <button onClick={run} disabled={step === "running" || step === "done"}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm transition-colors flex items-center justify-center gap-2">
          {step === "running" ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Initialize ho raha hai…</>
          ) : step === "done" ? (
            <><CheckCircle className="w-4 h-4" />Done!</>
          ) : (
            "Initialize Supabase →"
          )}
        </button>

        <p className="text-center text-xs text-slate-700 mt-4">
          Token sirf setup ke liye use hota hai, store nahi hota.
        </p>
      </div>
    </div>
  );
}
