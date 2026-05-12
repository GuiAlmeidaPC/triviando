import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Join() {
  const [pin, setPin] = useState("");
  const [nickname, setNickname] = useState("");
  const nav = useNavigate();

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
          maxLength={20}
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
