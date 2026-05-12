import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { LiveSocket, wsURL, type Envelope } from "../lib/ws";
import {
  MsgType,
  type HelloHost,
  type LobbyUpdate,
  type PlayerInfo,
  type ErrorMsg,
  type QuestionStart,
  type QuestionReveal,
  type GameFinished,
} from "../lib/live";
import { useCountdown } from "../lib/useCountdown";

const hostTokenKey = (gameId: string) => `triviando.hostToken.${gameId}`;

const choiceColors = [
  "bg-red-500",
  "bg-blue-500",
  "bg-yellow-500",
  "bg-green-500",
];

type Phase = "lobby" | "active" | "reveal" | "finished";

export default function Host() {
  const { gameId: routeGameId } = useParams<{ gameId: string }>();
  const [params] = useSearchParams();
  const startQuizId = params.get("quizId");

  const [pin, setPin] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(routeGameId ?? null);
  const [quizTitle, setQuizTitle] = useState("");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [question, setQuestion] = useState<QuestionStart | null>(null);
  const [reveal, setReveal] = useState<QuestionReveal | null>(null);
  const [finished, setFinished] = useState<GameFinished | null>(null);

  const sockRef = useRef<LiveSocket | null>(null);
  const remaining = useCountdown(phase === "active" && question ? question.endsAt : null);

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
        case MsgType.LobbyUpdate:
          setPlayers((env.data as LobbyUpdate).players);
          break;
        case MsgType.QuestionStart:
          setQuestion(env.data as QuestionStart);
          setReveal(null);
          setPhase("active");
          break;
        case MsgType.QuestionReveal:
          setReveal(env.data as QuestionReveal);
          setPhase("reveal");
          break;
        case MsgType.GameFinished:
          setFinished(env.data as GameFinished);
          setPhase("finished");
          break;
        case MsgType.Error:
          setError((env.data as ErrorMsg).message);
          break;
      }
    });

    sock.connect();

    if (routeGameId) {
      const token = localStorage.getItem(hostTokenKey(routeGameId));
      if (!token) setError("Missing host token for this game.");
      else sock.send(MsgType.HostAttach, { gameId: routeGameId, hostToken: token });
    } else if (startQuizId) {
      sock.send(MsgType.HostCreate, { quizId: startQuizId });
    } else {
      setError("No quiz to host.");
    }

    return () => sock.close();
  }, [routeGameId, startQuizId]);

  const send = (type: string, data: unknown = {}) => sockRef.current?.send(type, data);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <Link to="/quizzes" className="text-slate-400 hover:text-slate-200">← My quizzes</Link>
          {gameId && <span className="text-xs text-slate-600 font-mono">{gameId.slice(0, 8)}…</span>}
        </header>

        {error && <p className="text-red-400">{error}</p>}

        {phase === "lobby" && pin && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-slate-400">Join at</p>
              <p className="text-xl font-mono">{location.host}</p>
              <p className="text-slate-400 pt-4">PIN</p>
              <p className="text-7xl font-bold tracking-widest font-mono text-fuchsia-400">{pin}</p>
              <p className="text-slate-500 pt-2">{quizTitle}</p>
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-2">
                Players <span className="text-slate-500 font-normal">({players.length})</span>
              </h2>
              {players.length === 0 && <p className="text-slate-500">Waiting for players…</p>}
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {players.map((p) => (
                  <li key={p.id} className="bg-slate-900 border border-slate-800 rounded px-3 py-2">
                    {p.nickname}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => send(MsgType.HostStart)}
              disabled={players.length === 0}
              className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 disabled:opacity-30 text-white font-semibold py-3 rounded-lg transition"
            >
              Start game
            </button>
          </div>
        )}

        {phase === "active" && question && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-slate-400">
                Question {question.index + 1} / {question.total}
              </p>
              <p className="text-3xl font-mono">{remaining}s</p>
            </div>
            <h1 className="text-3xl font-semibold text-center">{question.prompt}</h1>
            <div className="grid grid-cols-2 gap-3">
              {question.choices.map((c, i) => (
                <div
                  key={c.id}
                  className={`${choiceColors[i % choiceColors.length]} rounded-lg p-4 text-white font-semibold text-lg`}
                >
                  {c.text}
                </div>
              ))}
            </div>
            <button
              onClick={() => send(MsgType.HostReveal)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-lg transition"
            >
              Reveal now
            </button>
          </div>
        )}

        {phase === "reveal" && reveal && question && (
          <div className="space-y-6">
            <p className="text-slate-400 text-center">
              Question {reveal.index + 1} / {question.total}
            </p>
            <h1 className="text-2xl font-semibold text-center">{question.prompt}</h1>
            <div className="grid grid-cols-2 gap-3">
              {question.choices.map((c, i) => {
                const correct = c.id === reveal.correctChoiceId;
                const count = reveal.perChoiceCounts[c.id] ?? 0;
                return (
                  <div
                    key={c.id}
                    className={`${choiceColors[i % choiceColors.length]} rounded-lg p-4 text-white font-semibold flex justify-between ${
                      correct ? "ring-4 ring-white" : "opacity-50"
                    }`}
                  >
                    <span>{c.text}</span>
                    <span className="font-mono">{count}</span>
                  </div>
                );
              })}
            </div>
            <Leaderboard rows={reveal.leaderboard} />
            <button
              onClick={() => send(MsgType.HostNext)}
              className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold py-3 rounded-lg transition"
            >
              {reveal.isLast ? "Finish" : "Next question"}
            </button>
          </div>
        )}

        {phase === "finished" && finished && (
          <div className="space-y-6 text-center">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              Game over!
            </h1>
            <Leaderboard rows={finished.leaderboard} highlight />
            <Link to="/quizzes" className="inline-block bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold py-3 px-6 rounded-lg transition">
              Back to quizzes
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Leaderboard({
  rows,
  highlight = false,
}: {
  rows: { playerId: string; nickname: string; score: number }[];
  highlight?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">Leaderboard</h2>
      <ol className="space-y-1">
        {rows.map((r, i) => (
          <li
            key={r.playerId}
            className={`flex items-center justify-between border rounded px-3 py-2 ${
              highlight && i === 0
                ? "bg-yellow-500/20 border-yellow-600"
                : "bg-slate-900 border-slate-800"
            }`}
          >
            <span>
              <span className="text-slate-500 mr-3 font-mono">{i + 1}</span>
              {r.nickname}
            </span>
            <span className="font-mono">{r.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
