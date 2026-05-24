import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { QRCodeSVG } from "qrcode.react";
import { getOwnerToken } from "../lib/owner";
import { RevealBars, AnimatedLeaderboard } from "../components/Reveal";

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
  const navigate = useNavigate();

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

          // Upgrade reconnection handshake to HostAttach so future reconnects
          // re-attach to this game instead of attempting to create a new one.
          sock.setHandshake(MsgType.HostAttach, {
            gameId: d.gameId,
            hostToken: d.hostToken,
          });

          // Store active session metadata for resumption
          localStorage.setItem(
            "triviando.activeHostSession",
            JSON.stringify({
              gameId: d.gameId,
              pin: d.pin,
              quizTitle: d.quizTitle,
            })
          );

          // Update URL to match gameId so refresh/reconnect works
          if (!routeGameId || routeGameId !== d.gameId) {
            navigate(`/host/${d.gameId}`, { replace: true });
          }

          // Restore phase from state
          if (d.state === "question_active") {
            setPhase("active");
          } else if (d.state === "question_reveal") {
            setPhase("reveal");
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
          setPhase("active");
          break;
        case MsgType.QuestionReveal:
          setReveal(env.data as QuestionReveal);
          setPhase("reveal");
          break;
        case MsgType.GameFinished:
          setFinished(env.data as GameFinished);
          setPhase("finished");
          localStorage.removeItem("triviando.activeHostSession");
          break;
        case MsgType.Error:
          setError((env.data as ErrorMsg).message);
          localStorage.removeItem("triviando.activeHostSession");
          break;
      }
    });

    sock.connect();

    if (routeGameId) {
      const token = localStorage.getItem(hostTokenKey(routeGameId));
      if (!token) setError("Missing host token for this game.");
      else sock.setHandshake(MsgType.HostAttach, { gameId: routeGameId, hostToken: token });
    } else if (startQuizId) {
      sock.setHandshake(MsgType.HostCreate, { quizId: startQuizId, ownerToken: getOwnerToken() });
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
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 md:p-8 backdrop-blur-md relative overflow-hidden shadow-2xl shadow-fuchsia-950/10">
              {/* Left Column: Connection Instructions */}
              <div className="md:col-span-7 flex flex-col justify-center space-y-4 text-center md:text-left">
                <div>
                  <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">Join at</p>
                  <p className="text-2xl md:text-3xl font-bold font-mono text-cyan-400 mt-1">{window.location.host}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mt-2">PIN Code</p>
                  <p className="text-6xl md:text-7xl font-extrabold tracking-widest font-mono text-fuchsia-400 mt-1 select-all filter drop-shadow-[0_0_12px_rgba(240,70,250,0.35)]">
                    {pin}
                  </p>
                </div>
                {quizTitle && (
                  <div className="pt-3 border-t border-slate-800/60">
                    <p className="text-slate-500 text-xs">Playing quiz</p>
                    <p className="text-slate-300 font-semibold text-lg">{quizTitle}</p>
                  </div>
                )}
              </div>

              {/* Right Column: QR Code Visual Card */}
              <div className="md:col-span-5 flex flex-col items-center justify-center p-6 bg-slate-950/60 border border-slate-800 rounded-xl relative group">
                {/* Subtle hover gradient glow */}
                <div className="absolute inset-0 bg-gradient-to-tr from-fuchsia-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl pointer-events-none" />
                
                {/* QR Code Container */}
                <div className="p-3 bg-white rounded-lg shadow-xl relative z-10">
                  <QRCodeSVG 
                    value={`${window.location.protocol}//${window.location.host}/join?pin=${pin}`}
                    size={180}
                    level="H"
                    includeMargin={false}
                  />
                </div>
                <p className="text-cyan-300 text-sm font-semibold tracking-wide uppercase mt-4 text-center z-10 flex items-center gap-1.5 animate-pulse">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  Scan to Join
                </p>
                <p className="text-slate-400 text-xs mt-1 text-center z-10">Skip typing the PIN!</p>
              </div>
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
            <RevealBars
              choices={question.choices}
              perChoiceCounts={reveal.perChoiceCounts}
              correctChoiceId={reveal.correctChoiceId}
              resetKey={reveal.index}
            />
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
            <AnimatedLeaderboard
              rows={finished.leaderboard}
              highlightWinner
              resetKey="final"
              dramatic
              title="Final standings"
            />
            <Link to="/quizzes" className="inline-block bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold py-3 px-6 rounded-lg transition">
              Back to quizzes
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

