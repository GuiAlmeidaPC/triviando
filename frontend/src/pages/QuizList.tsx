import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Quiz } from "../lib/api";

export default function QuizList() {
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  async function refresh() {
    try {
      setQuizzes(await api.listQuizzes());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
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
        <h1 className="text-3xl font-semibold">My quizzes</h1>

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
