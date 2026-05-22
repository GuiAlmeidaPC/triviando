import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LiveSocket, wsURL, type Envelope } from "../lib/ws";
import {
  MsgType,
  type HelloPlayer,
  type LobbyUpdate,
  type PlayerInfo,
  type ErrorMsg,
  type QuestionStart,
  type AnswerResult,
  type GameFinished,
} from "../lib/live";
import { useCountdown } from "../lib/useCountdown";

const choiceColors = [
  "bg-red-500 hover:bg-red-400 active:bg-red-600",
  "bg-blue-500 hover:bg-blue-400 active:bg-blue-600",
  "bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-600",
  "bg-green-500 hover:bg-green-400 active:bg-green-600",
];

type Phase = "joining" | "lobby" | "active" | "answered" | "result" | "finished";

export default function Play() {
  const [params] = useSearchParams();
  const pin = params.get("pin") ?? "";
  const nickname = params.get("nickname") ?? "";

  const [me, setMe] = useState<HelloPlayer | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("joining");
  const [question, setQuestion] = useState<QuestionStart | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [finished, setFinished] = useState<GameFinished | null>(null);

  const sockRef = useRef<LiveSocket | null>(null);
  const remaining = useCountdown(phase === "active" && question ? question.endsAt : null);

  useEffect(() => {
    if (!pin || !nickname) {
      setError("Missing PIN or nickname.");
      return;
    }
    const sock = new LiveSocket(wsURL());
    sockRef.current = sock;
    sock.on((env: Envelope) => {
      switch (env.type) {
        case MsgType.HelloPlayer: {
          const d = env.data as HelloPlayer;
          setMe(d);
          
          // Store active session metadata for resumption
          localStorage.setItem(
            "triviando.activePlayerSession",
            JSON.stringify({
              gameId: d.gameId,
              pin,
              nickname: d.nickname,
              playerId: d.playerId,
              playerToken: d.playerToken,
              quizTitle: d.quizTitle,
            })
          );

          // Restore phase from state
          if (d.state === "question_active") {
            setPhase("active");
          } else if (d.state === "finished") {
            setPhase("finished");
          } else {
            setPhase("lobby");
          }
          break;
        }
        case MsgType.LobbyUpdate:
          setPlayers((env.data as LobbyUpdate).players);
          break;
        case MsgType.QuestionStart:
          setQuestion(env.data as QuestionStart);
          setResult(null);
          setPhase("active");
          break;
        case MsgType.AnswerAck:
          setPhase("answered");
          break;
        case MsgType.AnswerResult:
          setResult(env.data as AnswerResult);
          setPhase("result");
          break;
        case MsgType.GameFinished:
          setFinished(env.data as GameFinished);
          setPhase("finished");
          localStorage.removeItem("triviando.activePlayerSession");
          break;
        case MsgType.Error:
          setError((env.data as ErrorMsg).message);
          localStorage.removeItem("triviando.activePlayerSession");
          break;
      }
    });
    sock.connect();

    const rawSession = localStorage.getItem("triviando.activePlayerSession");
    let storedSession: any = null;
    if (rawSession) {
      try {
        storedSession = JSON.parse(rawSession);
      } catch (e) {
        // ignore
      }
    }

    const isMatchingSession = storedSession &&
      storedSession.pin === pin &&
      storedSession.nickname === nickname;

    if (isMatchingSession) {
      sock.send(MsgType.PlayerAttach, { gameId: storedSession.gameId, playerToken: storedSession.playerToken });
    } else {
      sock.send(MsgType.PlayerJoin, { pin, nickname });
    }

    return () => sock.close();
  }, [pin, nickname]);

  function answer(choiceId: string) {
    sockRef.current?.send(MsgType.PlayerAnswer, { choiceId });
    setPhase("answered");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-md mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <Link to="/" className="text-slate-400 hover:text-slate-200">← Leave</Link>
          {me && <span className="text-slate-400">{me.nickname}</span>}
        </header>

        {error && (
          <div className="bg-red-950/40 border border-red-900 rounded p-4 text-red-300">
            {error}
            <Link to="/join" className="block mt-2 underline">Try again</Link>
          </div>
        )}

        {phase === "joining" && !error && (
          <p className="text-slate-500 text-center">Joining…</p>
        )}

        {phase === "lobby" && me && (
          <>
            <div className="text-center">
              <p className="text-slate-400">You're in!</p>
              <p className="text-3xl font-bold mt-2">{me.nickname}</p>
              <p className="text-slate-500 mt-1">{me.quizTitle}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm mb-2">Players ({players.length})</p>
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
            <p className="text-center text-slate-500 text-sm">Waiting for host to start…</p>
          </>
        )}

        {phase === "active" && question && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-slate-400">Question {question.index + 1} / {question.total}</p>
              <p className="text-2xl font-mono">{remaining}s</p>
            </div>
            <h1 className="text-xl font-semibold text-center">{question.prompt}</h1>
            <div className="grid grid-cols-1 gap-3">
              {question.choices.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => answer(c.id)}
                  className={`${choiceColors[i % choiceColors.length]} text-white font-semibold py-6 px-4 rounded-lg transition text-lg`}
                >
                  {c.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "answered" && (
          <div className="text-center space-y-2 pt-10">
            <p className="text-2xl font-semibold">Answer submitted</p>
            <p className="text-slate-500">Waiting for others…</p>
          </div>
        )}

        {phase === "result" && result && (
          <div className="text-center space-y-4 pt-6">
            <p className={`text-4xl font-bold ${result.wasCorrect ? "text-green-400" : "text-red-400"}`}>
              {result.wasCorrect ? "Correct!" : "Wrong"}
            </p>
            {result.pointsAwarded > 0 && (
              <p className="text-2xl">+{result.pointsAwarded} points</p>
            )}
            <p className="text-slate-400">
              Total: <span className="text-slate-100 font-mono">{result.totalScore}</span>
            </p>
            <p className="text-slate-400">
              Rank: <span className="text-slate-100 font-mono">#{result.rank}</span>
            </p>
            <p className="text-slate-500 text-sm pt-4">Waiting for next question…</p>
          </div>
        )}

        {phase === "finished" && finished && me && (
          <div className="space-y-6 text-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              Game over!
            </h1>
            <ol className="space-y-1 text-left">
              {finished.leaderboard.map((r, i) => (
                <li
                  key={r.playerId}
                  className={`flex items-center justify-between border rounded px-3 py-2 ${
                    r.playerId === me.playerId
                      ? "bg-fuchsia-950/30 border-fuchsia-700"
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
            <Link to="/" className="inline-block underline text-slate-400">Back to home</Link>
          </div>
        )}
      </div>
    </div>
  );
}
