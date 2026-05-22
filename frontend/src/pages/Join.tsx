import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { NICKNAME_MAX_LEN } from "../lib/live";

export default function Join() {
  const [searchParams] = useSearchParams();
  const [pin, setPin] = useState(searchParams.get("pin") ?? "");
  const [nickname, setNickname] = useState("");
  const nav = useNavigate();

  const [playerSession, setPlayerSession] = useState<{
    gameId: string;
    pin: string;
    nickname: string;
    playerId: string;
    playerToken: string;
    quizTitle: string;
  } | null>(null);

  useEffect(() => {
    const rawPlayer = localStorage.getItem("triviando.activePlayerSession");
    if (rawPlayer) {
      try {
        setPlayerSession(JSON.parse(rawPlayer));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const p = pin.trim();
    const n = nickname.trim();
    if (!p || !n) return;
    nav(`/play?pin=${encodeURIComponent(p)}&nickname=${encodeURIComponent(n)}`);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <Link to="/" className="block text-3xl font-bold tracking-tight bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent text-center">
          Triviando
        </Link>

        {playerSession && (
          <div className="bg-slate-900/60 border border-cyan-500/30 rounded-xl p-4 text-left space-y-2 backdrop-blur-md shadow-lg shadow-cyan-950/10 transition hover:border-cyan-500/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                Player Session Active
              </span>
              <button 
                type="button"
                onClick={() => {
                  localStorage.removeItem("triviando.activePlayerSession");
                  setPlayerSession(null);
                }}
                className="text-slate-500 hover:text-slate-300 text-xs transition cursor-pointer"
                title="Clear active session indicator"
              >
                Dismiss
              </button>
            </div>
            <p className="text-slate-300 text-sm">
              You are in <strong className="text-white">{playerSession.quizTitle || "a game"}</strong> as <strong className="text-cyan-400">{playerSession.nickname}</strong>.
            </p>
            <Link
              to={`/play?pin=${encodeURIComponent(playerSession.pin)}&nickname=${encodeURIComponent(playerSession.nickname)}`}
              className="inline-block text-xs font-semibold text-fuchsia-300 hover:text-fuchsia-200 underline transition"
            >
              Resume playing →
            </Link>
          </div>
        )}
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Game PIN"
          inputMode="numeric"
          autoFocus
          className="w-full text-3xl text-center tracking-widest font-mono bg-slate-900 border border-slate-800 rounded-lg px-4 py-4 focus:border-fuchsia-500 focus:outline-none"
        />
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Your nickname"
          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 focus:border-fuchsia-500 focus:outline-none"
          maxLength={NICKNAME_MAX_LEN}
        />
        <button
          type="submit"
          className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold py-3 rounded-lg transition"
        >
          Join
        </button>
      </form>
    </div>
  );
}
