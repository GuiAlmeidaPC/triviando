import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Question } from "../lib/api";

function blankQuestion(): Question {
  return {
    prompt: "",
    timeLimitSeconds: 20,
    points: 1000,
    choices: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };
}

export default function QuizEdit() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getQuiz(id)
      .then((q) => {
        setTitle(q.title);
        setQuestions(q.questions ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, [id]);

  async function save() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateQuiz(id, title, questions);
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function updateQuestion(idx: number, patch: Partial<Question>) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function updateChoice(qIdx: number, cIdx: number, patch: Partial<Question["choices"][number]>) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIdx
          ? { ...q, choices: q.choices.map((c, j) => (j === cIdx ? { ...c, ...patch } : c)) }
          : q,
      ),
    );
  }

  function setCorrect(qIdx: number, cIdx: number) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIdx
          ? { ...q, choices: q.choices.map((c, j) => ({ ...c, isCorrect: j === cIdx })) }
          : q,
      ),
    );
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, blankQuestion()]);
  }
  function removeQuestion(idx: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    setQuestions((qs) => {
      const j = idx + dir;
      if (j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-slate-100 p-6">Loading…</div>;
  }
  if (error && questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <p className="text-red-400">{error}</p>
        <button onClick={() => nav("/quizzes")} className="mt-4 underline">
          Back to list
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <Link to="/quizzes" className="text-slate-400 hover:text-slate-200">
            ← My quizzes
          </Link>
          <div className="flex items-center gap-3">
            {savedAt && !saving && (
              <span className="text-xs text-slate-500">
                Saved {new Date(savedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="bg-fuchsia-500 hover:bg-fuchsia-400 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </header>

        {error && <p className="text-red-400">{error}</p>}

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quiz title"
          className="w-full text-3xl font-semibold bg-transparent border-b border-slate-800 focus:border-fuchsia-500 focus:outline-none py-2"
        />

        <div className="space-y-4">
          {questions.map((q, qi) => (
            <div
              key={qi}
              className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Question {qi + 1}</span>
                <div className="flex items-center gap-2 text-sm">
                  <button onClick={() => move(qi, -1)} className="text-slate-500 hover:text-slate-200 px-1">↑</button>
                  <button onClick={() => move(qi, 1)} className="text-slate-500 hover:text-slate-200 px-1">↓</button>
                  <button onClick={() => removeQuestion(qi)} className="text-slate-500 hover:text-red-400 px-1">Remove</button>
                </div>
              </div>

              <input
                value={q.prompt}
                onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
                placeholder="Question prompt"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 focus:border-fuchsia-500 focus:outline-none"
              />

              <div className="grid grid-cols-2 gap-2">
                {q.choices.map((c, ci) => (
                  <label
                    key={ci}
                    className={`flex items-center gap-2 border rounded px-2 py-1 cursor-pointer ${
                      c.isCorrect ? "border-emerald-500 bg-emerald-950/30" : "border-slate-800 bg-slate-950"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`correct-${qi}`}
                      checked={c.isCorrect}
                      onChange={() => setCorrect(qi, ci)}
                      className="accent-emerald-500"
                    />
                    <input
                      value={c.text}
                      onChange={(e) => updateChoice(qi, ci, { text: e.target.value })}
                      placeholder={`Choice ${ci + 1}`}
                      className="flex-1 bg-transparent focus:outline-none"
                    />
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-4 text-sm text-slate-400">
                <label className="flex items-center gap-2">
                  Time (s)
                  <input
                    type="number"
                    value={q.timeLimitSeconds}
                    onChange={(e) => updateQuestion(qi, { timeLimitSeconds: Math.max(5, parseInt(e.target.value) || 0) })}
                    className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1"
                  />
                </label>
                <label className="flex items-center gap-2">
                  Points
                  <input
                    type="number"
                    value={q.points}
                    onChange={(e) => updateQuestion(qi, { points: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addQuestion}
          className="w-full bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 text-slate-400 hover:text-slate-200 py-3 rounded-lg transition"
        >
          + Add question
        </button>
      </div>
    </div>
  );
}
