import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LiveSocket, wsURL, type Envelope } from "../lib/ws";
import { MsgType, type HelloPlayer, type LobbyUpdate, type PlayerInfo, type ErrorMsg } from "../lib/live";

export default function Play() {
  const [params] = useSearchParams();
  const pin = params.get("pin") ?? "";
  const nickname = params.get("nickname") ?? "";

  const [me, setMe] = useState<HelloPlayer | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sockRef = useRef<LiveSocket | null>(null);

  useEffect(() => {
    if (!pin || !nickname) {
      setError("Missing PIN or nickname.");
      return;
    }
    const sock = new LiveSocket(wsURL());
    sockRef.current = sock;
    sock.on((env: Envelope) => {
      switch (env.type) {
        case MsgType.HelloPlayer:
          setMe(env.data as HelloPlayer);
          break;
        case MsgType.LobbyUpdate:
          setPlayers((env.data as LobbyUpdate).players);
          break;
        case MsgType.Error:
          setError((env.data as ErrorMsg).message);
          break;
      }
    });
    sock.connect();
    sock.send(MsgType.PlayerJoin, { pin, nickname });
    return () => sock.close();
  }, [pin, nickname]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-md mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <Link to="/" className="text-slate-400 hover:text-slate-200">← Leave</Link>
        </header>

        {error && (
          <div className="bg-red-950/40 border border-red-900 rounded p-4 text-red-300">
            {error}
            <Link to="/join" className="block mt-2 underline">Try again</Link>
          </div>
        )}

        {!error && !me && <p className="text-slate-500 text-center">Joining…</p>}

        {me && (
          <>
            <div className="text-center">
              <p className="text-slate-400">You're in!</p>
              <p className="text-3xl font-bold mt-2">{me.nickname}</p>
              <p className="text-slate-500 mt-1">{me.quizTitle}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm mb-2">
                Players ({players.length})
              </p>
              <ul className="grid grid-cols-2 gap-2">
                {players.map((p) => (
                  <li
                    key={p.id}
                    className={`rounded px-3 py-2 border ${
                      p.id === me.playerId
                        ? "bg-fuchsia-950/30 border-fuchsia-700"
                        : "bg-slate-900 border-slate-800"
                    }`}
                  >
                    {p.nickname}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-center text-slate-500 text-sm">
              Waiting for the host to start…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
