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
  type QuestionReveal,
  type GameFinished,
} from "../lib/live";
import { useCountdown } from "../lib/useCountdown";
import { RevealBars, AnimatedLeaderboard, useRevealPhase } from "../components/Reveal";

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
  const [reveal, setReveal] = useState<QuestionReveal | null>(null);
  const [myChoice, setMyChoice] = useState<string | null>(null);
  const [finished, setFinished] = useState<GameFinished | null>(null);

  const sockRef = useRef<LiveSocket | null>(null);
  const phaseRef = useRef<Phase>("joining");
  useEffect(() => { phaseRef.current = phase; }, [phase]);
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

          // Upgrade the reconnection handshake to PlayerAttach so any future
          // reconnect re-attaches this player instead of joining as a new one.
          sock.setHandshake(MsgType.PlayerAttach, {
            gameId: d.gameId,
            playerToken: d.playerToken,
          });

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
          setReveal(null);
          setMyChoice(null);
          setError(null);
          setPhase("active");
          break;
        case MsgType.AnswerAck:
          setPhase("answered");
          break;
        case MsgType.QuestionReveal:
          setReveal(env.data as QuestionReveal);
          setError(null);
          setPhase("result");
          break;
        case MsgType.GameFinished:
          setFinished(env.data as GameFinished);
          setPhase("finished");
          localStorage.removeItem("triviando.activePlayerSession");
          break;
        case MsgType.Error: {
          const msg = (env.data as ErrorMsg).message;
          // Mid-game races (e.g. clicking after host reveals) are benign —
          // log them but don't surface or kill the session.
          if (phaseRef.current === "joining") {
            setError(msg);
            localStorage.removeItem("triviando.activePlayerSession");
          } else {
            console.warn("server error (ignored):", msg);
          }
          break;
        }
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
      sock.setHandshake(MsgType.PlayerAttach, { gameId: storedSession.gameId, playerToken: storedSession.playerToken });
    } else {
      sock.setHandshake(MsgType.PlayerJoin, { pin, nickname });
    }

    return () => sock.close();
  }, [pin, nickname]);

  function answer(choiceId: string) {
    sockRef.current?.send(MsgType.PlayerAnswer, { choiceId });
    setMyChoice(choiceId);
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

        {phase === "result" && reveal && question && (
          <PlayReveal
            reveal={reveal}
            question={question}
            myChoice={myChoice}
          />
        )}

        {phase === "finished" && finished && me && (
          <div className="space-y-6 text-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 to-cyan-300 bg-clip-text text-transparent animate-[fadeInUp_600ms_ease-out_both]">
              Game over!
            </h1>
            <div className="text-left">
              <AnimatedLeaderboard
                rows={finished.leaderboard}
                highlightWinner
                highlightPlayerId={me.playerId}
                resetKey="final"
                dramatic
                title="Final standings"
              />
            </div>
            <Link to="/" className="inline-block underline text-slate-400">Back to home</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayReveal({
  reveal,
  question,
  myChoice,
}: {
  reveal: QuestionReveal;
  question: QuestionStart;
  myChoice: string | null;
}) {
  const phase = useRevealPhase(reveal.index, question.choices.length);
  const revealed = phase === "revealed";
  const answered = myChoice !== null;
  const wasCorrect = answered && myChoice === reveal.correctChoiceId;
  const correctChoice = question.choices.find((c) => c.id === reveal.correctChoiceId);

  let headline: string;
  let headlineClass: string;
  if (!answered) {
    headline = "Time's up";
    headlineClass = "text-slate-400";
  } else if (wasCorrect) {
    headline = "Correct!";
    headlineClass = "text-green-400 drop-shadow-[0_0_18px_rgba(74,222,128,0.45)]";
  } else {
    headline = "Wrong";
    headlineClass = "text-red-400";
  }

  const placeholder = answered ? "Counting votes…" : "Time's up";

  return (
    <div className="space-y-5">
      <div className="h-12 flex items-center justify-center">
        {revealed ? (
          <p
            key={`headline-${reveal.index}`}
            className={`text-4xl font-bold text-center ${headlineClass} animate-[fadeInUp_500ms_ease-out_both]`}
          >
            {headline}
          </p>
        ) : (
          <p className="text-slate-500 text-sm uppercase tracking-wider">{placeholder}</p>
        )}
      </div>

      {revealed && correctChoice && (
        <div
          key={`correct-${reveal.index}`}
          className="bg-green-950/40 border-2 border-green-500 rounded-lg p-4 text-center animate-[fadeInUp_600ms_ease-out_120ms_both]"
        >
          <p className="text-xs uppercase tracking-wider text-green-400 font-semibold mb-1">
            Correct answer
          </p>
          <p className="text-xl font-semibold text-green-100">{correctChoice.text}</p>
        </div>
      )}

      <RevealBars
        choices={question.choices}
        perChoiceCounts={reveal.perChoiceCounts}
        correctChoiceId={reveal.correctChoiceId}
        myChoice={myChoice}
        resetKey={reveal.index}
        compact
      />

      <p className="text-slate-500 text-sm text-center pt-2">Waiting for next question…</p>
    </div>
  );
}
