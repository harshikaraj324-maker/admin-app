import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import Apps from "@/pages/Apps";
import AppDetail from "@/pages/AppDetail";
import Settings from "@/pages/Settings";
import { checkSetupDone } from "@/lib/supabase";
import type { AdminApp } from "@/lib/types";

type Page = "dashboard" | "apps" | "settings";

export default function App() {
  const [ready, setReady] = useState<"checking" | "setup" | "done">("checking");
  const [page, setPage] = useState<Page>("dashboard");
  const [openApp, setOpenApp] = useState<AdminApp | null>(null);

  useEffect(() => {
    checkSetupDone().then((ok) => setReady(ok ? "done" : "setup"));
  }, []);

  if (ready === "checking") {
    return (
      <div className="min-h-screen bg-[#080c16] flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-slate-800 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (ready === "setup") {
    return <Setup onDone={() => setReady("done")} />;
  }

  const handleNav = (p: Page) => {
    setPage(p);
    setOpenApp(null);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#080c16]">
      <Sidebar page={page} onNav={handleNav} />
      {openApp ? (
        <AppDetail app={openApp} onBack={() => setOpenApp(null)} />
      ) : page === "dashboard" ? (
        <Dashboard onOpenApp={setOpenApp} />
      ) : page === "apps" ? (
        <Apps onOpenApp={setOpenApp} />
      ) : (
        <Settings />
      )}
    </div>
  );
}
