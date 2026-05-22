import { Copy, CheckCircle, Database, Globe, Key, ExternalLink } from "lucide-react";
import { useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY, PROJECT_REF } from "@/lib/supabase";

export default function Settings() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = async (val: string, key: string) => {
    await navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const rows = [
    { label: "Supabase URL",     value: SUPABASE_URL, icon: Globe, copyKey: "url"  },
    { label: "Publishable Key",  value: SUPABASE_KEY, icon: Key,   copyKey: "key"  },
    { label: "Project Ref",      value: PROJECT_REF,  icon: Database, copyKey: "ref" },
  ];

  return (
    <div className="flex-1 overflow-auto bg-[#080c16]">
      <div className="sticky top-0 z-10 bg-[#080c16]/90 backdrop-blur border-b border-slate-800/60 h-14 flex items-center px-6">
        <div>
          <h1 className="text-sm font-semibold text-white">Settings</h1>
          <p className="text-xs text-slate-600">Supabase project configuration</p>
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-2xl">
        <div className="bg-[#0d1220] border border-slate-800 rounded-2xl overflow-hidden">
          {rows.map(({ label, value, icon: Icon, copyKey }, i) => (
            <div key={copyKey}
                 className={`flex items-center gap-4 px-4 py-4 ${i < rows.length - 1 ? "border-b border-slate-800/60" : ""}`}>
              <div className="w-8 h-8 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                <p className="font-mono text-xs text-slate-300 truncate">{value}</p>
              </div>
              <button onClick={() => copy(value, copyKey)}
                      className="flex items-center gap-1 text-xs text-slate-600 hover:text-white transition-colors flex-shrink-0">
                {copiedKey === copyKey ? (
                  <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" />Copied</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" />Copy</>
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Links */}
        <div className="bg-[#0d1220] border border-slate-800 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-500 mb-3">Quick Links</p>
          {[
            { label: "Supabase Dashboard", href: `https://supabase.com/dashboard/project/${PROJECT_REF}` },
            { label: "Table Editor", href: `https://supabase.com/dashboard/project/${PROJECT_REF}/editor` },
            { label: "Database Logs", href: `https://supabase.com/dashboard/project/${PROJECT_REF}/logs/postgres-logs` },
          ].map(({ label, href }) => (
            <a key={href} href={href} target="_blank" rel="noreferrer"
               className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-800 transition-colors group">
              <span className="text-sm text-slate-400 group-hover:text-white transition-colors">{label}</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 transition-colors" />
            </a>
          ))}
        </div>

        <div className="bg-amber-900/10 border border-amber-800/30 rounded-2xl p-4">
          <p className="text-xs font-semibold text-amber-400 mb-2">Note</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Publishable key client-side use hoti hai — sirf data read/write. DDL (table creation) ke liye RPC function use hota hai jo backend pe run hoti hai.
          </p>
        </div>
      </div>
    </div>
  );
}
