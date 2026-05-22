import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: "blue" | "green" | "red" | "amber" | "slate";
  sub?: string;
}

const colors = {
  blue:  { bg: "bg-blue-500/10",  icon: "text-blue-400",  border: "border-blue-500/20" },
  green: { bg: "bg-emerald-500/10", icon: "text-emerald-400", border: "border-emerald-500/20" },
  red:   { bg: "bg-red-500/10",   icon: "text-red-400",   border: "border-red-500/20" },
  amber: { bg: "bg-amber-500/10", icon: "text-amber-400", border: "border-amber-500/20" },
  slate: { bg: "bg-slate-700/30", icon: "text-slate-400", border: "border-slate-700/50" },
};

export default function StatCard({ label, value, icon: Icon, color = "blue", sub }: StatCardProps) {
  const c = colors[color];
  return (
    <div className={`bg-[#111827] border ${c.border} rounded-2xl p-5 flex items-start gap-4`}>
      <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${c.icon}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
      </div>
    </div>
  );
}
