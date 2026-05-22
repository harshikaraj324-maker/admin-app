interface BadgeProps {
  variant: "active" | "blocked" | "online" | "offline" | "unknown" | "inactive";
  pulse?: boolean;
}

const cfg = {
  active:   { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
  blocked:  { cls: "bg-red-500/15 text-red-400 border-red-500/20",             dot: "bg-red-400" },
  online:   { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
  offline:  { cls: "bg-slate-700/50 text-slate-500 border-slate-700",          dot: "bg-slate-500" },
  unknown:  { cls: "bg-amber-500/10 text-amber-400 border-amber-500/20",       dot: "bg-amber-400" },
  inactive: { cls: "bg-slate-700/50 text-slate-500 border-slate-700",          dot: "bg-slate-500" },
};

export default function Badge({ variant, pulse }: BadgeProps) {
  const { cls, dot } = cfg[variant];
  const label = variant.charAt(0).toUpperCase() + variant.slice(1);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${pulse ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}
