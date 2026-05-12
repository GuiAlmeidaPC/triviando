import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { LiveSocket, wsURL, type Envelope } from "../lib/ws";
import { MsgType, type HelloHost, type LobbyUpdate, type PlayerInfo, type ErrorMsg } from "../lib/live";

// Storage key per-game so a host can reload and reattach.
const hostTokenKey = (gameId: string) => `triviando.hostToken.${gameId}`;

export default function Host() {
  const { gameId: routeGameId } = useParams<{ gameId: string }>();
  const [params] = useSearchParams();
  const startQuizId = params.get("quizId"); // present when freshly creating from /host?quizId=…

  const [pin, setPin] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(routeGameId ?? null);
  const [quizTitle, setQuizTitle] = useState("");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sockRef = useRef<LiveSocket | null>(null);

  useEffect(() => {
    const sock = new LiveSocket(wsURL());
    sockRef.current = sock;

    sock.on((env: Envelope) => {
      switch (env.type) {
        case MsgType.HelloHost: {
          const d = env.data as HelloHost;
          setGameId(d.gameId);
          setPin(d.pin);
          setQuizTitle(d.quizTitle);
          setPlayers(d.players);
          localStorage.setItem(hostTokenKey(d.gameId), d.hostToken);
          break;
        }
        case MsgType.LobbyUpdate: {
          setPlayers((env.data as LobbyUpdate).players);
          break;
        }
        case MsgType.Error: {
          setError((env.data as ErrorMsg).message);
          break;
        }
      }
    });

    sock.connect();

    if (routeGameId) {
      const token = localStorage.getItem(hostTokenKey(routeGameId));
      if (!token) {
        setError("Missing host token for this game (was it created on a different device?).");
      } else {
        sock.send(MsgType.HostAttach, { gameId: routeGameId, hostToken: token });
      }
    } else if (startQuizId) {
      sock.send(MsgType.HostCreate, { quizId: startQuizId });
    } else {
      setError("No quiz to host.");
    }

    return () => sock.close();
  }, [routeGameId, startQuizId]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <Link to="/quizzes" className="text-slate-400 hover:text-slate-200">← My quizzes</Link>
          {gameId && <span className="text-xs text-slate-600 font-mono">{gameId}</span>}
        </header>

        {error && <p className="text-red-400">{error}</p>}

        {pin && (
          <div className="text-center space-y-2">
            <p className="text-slate-400">Join at</p>
            <p className="text-xl font-mono">{location.host}</p>
            <p className="text-slate-400 pt-4">PIN</p>
            <p className="text-7xl font-bold tracking-widest font-mono text-fuchsia-400">{pin}</p>
            <p className="text-slate-500 pt-2">{quizTitle}</p>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-xl font-semibold">
            Players <span className="text-slate-500 font-normal">({players.length})</span>
          </h2>
          {players.length === 0 && <p className="text-slate-500">Waiting for players to join…</p>}
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {players.map((p) => (
              <li key={p.id} className="bg-slate-900 border border-slate-800 rounded px-3 py-2">
                {p.nickname}
              </li>
            ))}
          </ul>
        </div>

        <button
          disabled
          className="w-full bg-slate-800 text-slate-500 font-semibold py-3 rounded-lg cursor-not-allowed"
          title="Coming in milestone 4"
        >
          Start (coming soon)
        </button>
      </div>
    </div>
  );
}
