import { LayoutDashboard, Boxes, Settings } from "lucide-react";

type Page = "dashboard" | "apps" | "settings";

interface SidebarProps {
  page: Page;
  onNav: (p: Page) => void;
}

const NAV = [
  { id: "dashboard" as Page, label: "Dashboard", icon: LayoutDashboard },
  { id: "apps"      as Page, label: "Apps",        icon: Boxes },
  { id: "settings"  as Page, label: "Settings",    icon: Settings },
];

export default function Sidebar({ page, onNav }: SidebarProps) {
  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden sm:flex w-52 flex-shrink-0 bg-[#0d1220] border-r border-slate-800/70 flex-col">
        <div className="h-14 flex items-center px-4 border-b border-slate-800/70">
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

        <nav className="flex-1 py-3 px-2">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                onClick={() => onNav(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-sm transition-all ${
                  active
                    ? "bg-blue-600/15 text-blue-400 font-medium"
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-blue-400" : ""}`} />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-slate-800/70">
          <p className="text-[10px] text-slate-600 truncate">imfwqoocwfvvtjghgofi</p>
          <p className="text-[10px] text-slate-700">Supabase Project</p>
        </div>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0d1220] border-t border-slate-800/70 flex">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => onNav(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors ${
                active ? "text-blue-400" : "text-slate-600"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
