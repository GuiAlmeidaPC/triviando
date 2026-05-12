import { useEffect, useState } from "react";

export default function App() {
  const [ping, setPing] = useState<string>("…");

  useEffect(() => {
    fetch("/api/ping")
      .then((r) => r.json())
      .then((d) => setPing(d.message ?? "(no message)"))
      .catch((e) => setPing(`error: ${e.message}`));
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
          Triviando
        </h1>
        <p className="text-slate-400">Real-time trivia, coming soon.</p>
        <p className="text-xs text-slate-500">
          backend: <span className="font-mono">{ping}</span>
        </p>
      </div>
    </div>
  );
}
