import { useState, useEffect } from "react";
import { checkSetupDone } from "@/lib/supabase";
import Setup from "@/pages/Setup";
import Home from "@/pages/Home";

type AppState = "loading" | "setup" | "home";

export default function App() {
  const [state, setState] = useState<AppState>("loading");

  useEffect(() => {
    checkSetupDone().then((done) => {
      setState(done ? "home" : "setup");
    });
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <span className="w-5 h-5 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Supabase se connect ho raha hoon...</span>
        </div>
      </div>
    );
  }

  if (state === "setup") {
    return <Setup onDone={() => setState("home")} />;
  }

  return <Home />;
}
