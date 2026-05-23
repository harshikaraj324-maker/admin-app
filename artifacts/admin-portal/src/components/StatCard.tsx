import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: "blue" | "green" | "red" | "amber" | "slate";
  sub?: string;
}

const colors = {
  blue:  { dot: "bg-blue-500",    icon: "text-blue-400"    },
  green: { dot: "bg-emerald-500", icon: "text-emerald-400" },
  red:   { dot: "bg-red-500",     icon: "text-red-400"     },
  amber: { dot: "bg-amber-500",   icon: "text-amber-400"   },
  slate: { dot: "bg-slate-500",   icon: "text-slate-400"   },
};

export default function StatCard({ label, value, icon: Icon, color = "blue", sub }: StatCardProps) {
  const c = colors[color];
  return (
    <div className="bg-[#0d1220] border border-slate-800/80 rounded-xl px-3.5 py-3 flex items-center gap-3">
      <Icon className={`w-4 h-4 flex-shrink-0 ${c.icon}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 leading-none mb-0.5">{label}</p>
        <p className="text-base font-bold text-white tabular-nums leading-none">{value}</p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5 leading-none">{sub}</p>}
      </div>
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot} opacity-60`} />
    </div>
  );
}
