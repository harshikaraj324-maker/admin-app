import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Setup from "@/pages/Setup";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Apps from "@/pages/Apps";
import Settings from "@/pages/Settings";
import { checkSetupDone, autoFixAllTables } from "@/lib/supabase";
import { getSessionToken } from "@/lib/auth";

type Page = "dashboard" | "apps" | "settings";
type AuthState = "checking" | "login" | "setup" | "done";

export default function App() {
  const [auth, setAuth] = useState<AuthState>("checking");
  const [page, setPage] = useState<Page>("dashboard");

  const checkAll = async () => {
    const token = getSessionToken();
    if (!token) { setAuth("login"); return; }
    const ok = await checkSetupDone();
    if (!ok) { setAuth("setup"); return; }
    setAuth("done");
    void autoFixAllTables();
  };

  useEffect(() => { void checkAll(); }, []);

  if (auth === "checking") {
    return (
      <div className="min-h-screen bg-[#080c16] flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-slate-800 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (auth === "login") {
    return <Login onLogin={() => void checkAll()} />;
  }

  if (auth === "setup") return <Setup onDone={() => void checkAll()} />;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#080c16]">
      <Sidebar page={page} onNav={setPage} onLogout={() => setAuth("login")} />
      <div className="flex-1 overflow-hidden pb-16 md:pb-0">
        {page === "dashboard" ? (
          <Dashboard />
        ) : page === "apps" ? (
          <Apps />
        ) : (
          <Settings />
        )}
      </div>
    </div>
  );
}
