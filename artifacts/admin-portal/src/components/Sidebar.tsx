import { LayoutDashboard, Boxes, Settings, ChevronRight } from "lucide-react";

type Page = "dashboard" | "apps" | "settings";

interface SidebarProps {
  page: Page;
  onNav: (p: Page) => void;
}

const NAV = [
  { id: "dashboard" as Page, label: "Dashboard", icon: LayoutDashboard },
  { id: "apps" as Page, label: "Applications", icon: Boxes },
  { id: "settings" as Page, label: "Settings", icon: Settings },
];

export default function Sidebar({ page, onNav }: SidebarProps) {
  return (
    <aside className="w-56 flex-shrink-0 bg-[#0d1220] border-r border-slate-800/70 flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-slate-800/70">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-xs font-bold text-white">A</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">AdminPanel</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Device Manager</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNav(id)}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-sm transition-all ${
                active
                  ? "bg-blue-600/15 text-blue-400 font-medium"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${active ? "text-blue-400" : ""}`} />
                {label}
              </span>
              {active && <ChevronRight className="w-3 h-3 opacity-60" />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800/70">
        <p className="text-[10px] text-slate-600">imfwqoocwfvvtjghgofi</p>
        <p className="text-[10px] text-slate-700 truncate">Supabase Project</p>
      </div>
    </aside>
  );
}
