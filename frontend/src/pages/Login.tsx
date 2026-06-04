import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { signIn } from "../lib/owner";

type Mode = "login" | "register";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp =
        mode === "login"
          ? await api.login(username.trim(), password)
          : await api.register(username.trim(), password);
      signIn(resp.username, resp.ownerToken);
      nav("/quizzes");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <Link to="/" className="text-4xl font-bold bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
            Triviando
          </Link>
          <p className="text-slate-400 text-sm">
            {mode === "login" ? "Sign in to access your quizzes anywhere." : "Create an account to access your quizzes from any device."}
          </p>
        </div>

        <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-1">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${
                mode === m ? "bg-fuchsia-500 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 focus:border-fuchsia-500 focus:outline-none transition"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-slate-100 focus:border-fuchsia-500 focus:outline-none transition"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {mode === "register" && (
            <p className="text-xs text-slate-500">
              Quizzes you already created on this device will be linked to your new account.
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition"
          >
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="text-center">
          <Link to="/quizzes" className="text-sm text-slate-500 hover:text-slate-300 underline transition">
            Continue without an account
          </Link>
        </div>
      </div>
    </div>
  );
}
