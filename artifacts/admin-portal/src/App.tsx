import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import Apps from "@/pages/Apps";
import Settings from "@/pages/Settings";
import { checkSetupDone, autoFixAllTables } from "@/lib/supabase";

type Page = "dashboard" | "apps" | "settings";

export default function App() {
  const [ready, setReady] = useState<"checking" | "setup" | "done">("checking");
  const [page, setPage] = useState<Page>("dashboard");

  useEffect(() => {
    checkSetupDone().then((ok) => {
      setReady(ok ? "done" : "setup");
      if (ok) void autoFixAllTables();
    });
  }, []);

  if (ready === "checking") {
    return (
      <div className="min-h-screen bg-[#080c16] flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-slate-800 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (ready === "setup") return <Setup onDone={() => setReady("done")} />;

  return (
    <div className="flex h-screen overflow-hidden bg-[#080c16]">
      <Sidebar page={page} onNav={setPage} />
      {page === "dashboard" ? (
        <Dashboard />
      ) : page === "apps" ? (
        <Apps />
      ) : (
        <Settings />
      )}
    </div>
  );
}
