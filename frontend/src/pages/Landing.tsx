import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function Landing() {
  const [activeSession, setActiveSession] = useState<{ gameId: string; pin: string; quizTitle: string } | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("triviando.activeHostSession");
    if (raw) {
      try {
        setActiveSession(JSON.parse(raw));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="text-center space-y-6 w-full max-w-md">
        <h1 className="text-6xl font-bold tracking-tight bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
          Triviando
        </h1>
        <p className="text-slate-400">Real-time trivia for groups.</p>

        {activeSession && (
          <div className="bg-slate-900/60 border border-fuchsia-500/30 rounded-xl p-4 text-left space-y-2 backdrop-blur-md shadow-lg shadow-fuchsia-950/10 transition hover:border-fuchsia-500/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-fuchsia-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-ping" />
                Live Session Active
              </span>
              <button 
                onClick={() => {
                  localStorage.removeItem("triviando.activeHostSession");
                  setActiveSession(null);
                }}
                className="text-slate-500 hover:text-slate-300 text-xs transition cursor-pointer"
                title="Clear active session indicator"
              >
                Dismiss
              </button>
            </div>
            <p className="text-slate-300 text-sm">
              You are currently hosting <strong className="text-white">{activeSession.quizTitle}</strong> (PIN: <strong className="text-fuchsia-400 font-mono">{activeSession.pin}</strong>).
            </p>
            <Link
              to={`/host/${activeSession.gameId}`}
              className="inline-block text-xs font-semibold text-cyan-300 hover:text-cyan-200 underline transition"
            >
              Resume hosting room →
            </Link>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Link
            to="/join"
            className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold py-3 px-6 rounded-lg transition text-center"
          >
            Join with PIN
          </Link>
          <Link
            to="/quizzes"
            className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold py-3 px-6 rounded-lg transition text-center"
          >
            Host: my quizzes
          </Link>
        </div>
      </div>
    </div>
  );
}
