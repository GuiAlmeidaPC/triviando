import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type FinishedGame, type Quiz } from "../lib/api";
import { clearHostSession, loadHostSession } from "../lib/session";

export default function QuizList() {
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [history, setHistory] = useState<FinishedGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<{ gameId: string; pin: string; quizTitle: string } | null>(null);
  const nav = useNavigate();

  async function refresh() {
    try {
      const [quizzesRes, historyRes] = await Promise.all([api.listQuizzes(), api.listHistory()]);
      setQuizzes(quizzesRes);
      setHistory(historyRes);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    setActiveSession(loadHostSession());
  }, []);

  async function onCreate() {
    try {
      const q = await api.createQuiz("Untitled quiz");
      nav(`/edit/${q.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this quiz?")) return;
    try {
      await api.deleteQuiz(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
            Triviando
          </Link>
          <button
            onClick={onCreate}
            className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            + New quiz
          </button>
        </header>

        {activeSession && (
          <div className="bg-slate-900/60 border border-fuchsia-500/30 rounded-xl p-4 text-left space-y-2 backdrop-blur-md shadow-lg shadow-fuchsia-950/10 transition hover:border-fuchsia-500/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-fuchsia-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-ping" />
                Live Session Active
              </span>
              <button 
                onClick={() => {
                  clearHostSession();
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

        <h1 className="text-3xl font-semibold">My quizzes</h1>

        {history && history.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Recent game history</h2>
              <span className="text-sm text-slate-500">{history.length} recent game{history.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="space-y-2">
              {history.slice(0, 5).map((game) => {
                const winner = game.leaderboard[0];
                return (
                  <li key={game.gameId} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium">{game.quizTitle}</div>
                        <div className="text-xs text-slate-500">
                          Finished {new Date(game.completedAt).toLocaleString()} · {game.playerCount} player{game.playerCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <span className="text-xs font-mono text-slate-500">{game.gameId.slice(0, 8)}…</span>
                    </div>
                    {winner && (
                      <div className="text-sm text-slate-300">
                        Winner: <span className="font-semibold text-white">{winner.nickname}</span> · {winner.score.toLocaleString()} pts
                      </div>
                    )}
                    {game.leaderboard.length > 1 && (
                      <div className="text-xs text-slate-500">
                        Top 3: {game.leaderboard.slice(0, 3).map((row) => `${row.rank}. ${row.nickname}`).join(" · ")}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {error && <p className="text-red-400">{error}</p>}
        {quizzes === null && <p className="text-slate-500">Loading…</p>}
        {quizzes && quizzes.length === 0 && (
          <p className="text-slate-500">No quizzes yet. Create one to get started.</p>
        )}

        <ul className="space-y-2">
          {quizzes?.map((q) => (
            <li
              key={q.id}
              className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-center justify-between hover:border-slate-700 transition"
            >
              <Link to={`/edit/${q.id}`} className="flex-1">
                <div className="font-medium">{q.title}</div>
                <div className="text-xs text-slate-500">
                  Updated {new Date(q.updatedAt).toLocaleString()}
                </div>
              </Link>
              <button
                onClick={() => onDelete(q.id)}
                className="text-slate-500 hover:text-red-400 text-sm px-2"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
