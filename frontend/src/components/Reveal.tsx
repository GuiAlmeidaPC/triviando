import { useEffect, useMemo, useRef, useState } from "react";

const choiceBarColors = [
  "bg-red-500",
  "bg-blue-500",
  "bg-yellow-500",
  "bg-green-500",
];

// Reveal animation timing. Tweak here to retune the whole arc.
const BAR_GROW_MS = 2200;
const BAR_STAGGER_MS = 180;
const COUNT_UP_MS = 2000;
// After the last bar finishes growing we wait a beat, then reveal the answer.
const SUSPENSE_HOLD_MS = 700;

type Phase = "setup" | "voting" | "suspense" | "revealed";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Drives the reveal screen through its beats: bars grow first (voting),
 * a short pause lets the eye settle (suspense), then the correct answer is
 * highlighted (revealed). Restarts whenever resetKey changes.
 *
 * Exported so pages (Play.tsx) can sync personal-feedback elements
 * (the "Correct!" headline, the "Correct answer is X" card) with the same
 * beat as the bar highlight.
 */
export function useRevealPhase(resetKey: unknown, choiceCount = 4): Phase {
  const [phase, setPhase] = useState<Phase>("setup");
  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase("revealed");
      return;
    }
    setPhase("setup");
    const lastBarStart = Math.max(0, (choiceCount - 1) * BAR_STAGGER_MS);
    const votingEnd = lastBarStart + BAR_GROW_MS;
    const revealAt = votingEnd + SUSPENSE_HOLD_MS;
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setPhase("voting"), 60));
    timers.push(window.setTimeout(() => setPhase("suspense"), votingEnd));
    timers.push(window.setTimeout(() => setPhase("revealed"), revealAt));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [resetKey, choiceCount]);
  return phase;
}

/**
 * Animate a number from 0 → target over `duration` ms with ease-out cubic.
 * Restarts whenever the resetKey changes.
 */
function useCountUp(target: number, duration = COUNT_UP_MS, resetKey: unknown = target) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    if (target === 0) return;
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, duration]);
  return value;
}

export interface Choice {
  id: string;
  text: string;
}

export interface RevealBarsProps {
  choices: Choice[];
  perChoiceCounts: Record<string, number>;
  correctChoiceId: string;
  myChoice?: string | null;
  /** Key that, when changed, restarts the animation (e.g. question index). */
  resetKey: string | number;
  /** Compact variant for player mobile view. */
  compact?: boolean;
}

/**
 * Horizontal bar chart driven by useRevealPhase. Bars grow first; the
 * correct-answer treatment only appears once we transition to "revealed".
 */
export function RevealBars({
  choices,
  perChoiceCounts,
  correctChoiceId,
  myChoice,
  resetKey,
  compact = false,
}: RevealBarsProps) {
  const totalVotes = useMemo(
    () => Object.values(perChoiceCounts).reduce((a, b) => a + b, 0),
    [perChoiceCounts]
  );
  const maxCount = useMemo(
    () => choices.reduce((m, c) => Math.max(m, perChoiceCounts[c.id] ?? 0), 0),
    [choices, perChoiceCounts]
  );

  const phase = useRevealPhase(resetKey, choices.length);
  const ready = phase !== "setup";
  const revealed = phase === "revealed";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact && (
        <div className="flex items-baseline justify-between">
          <p className="text-slate-400 text-sm uppercase tracking-wider">Responses</p>
          <p className="text-slate-500 text-xs font-mono">{totalVotes} total</p>
        </div>
      )}
      {choices.map((c, i) => {
        const count = perChoiceCounts[c.id] ?? 0;
        // Scale bars relative to the leader so the winner reaches ~100%.
        const targetPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const isCorrect = c.id === correctChoiceId;
        const isMine = myChoice === c.id;
        const color = choiceBarColors[i % choiceBarColors.length];
        return (
          <BarRow
            key={c.id}
            label={c.text}
            count={count}
            targetPct={targetPct}
            colorClass={color}
            isCorrect={isCorrect}
            isMine={isMine}
            staggerMs={i * BAR_STAGGER_MS}
            ready={ready}
            revealed={revealed}
            resetKey={`${resetKey}:${c.id}`}
            compact={compact}
          />
        );
      })}
    </div>
  );
}

function BarRow({
  label,
  count,
  targetPct,
  colorClass,
  isCorrect,
  isMine,
  staggerMs,
  ready,
  revealed,
  resetKey,
  compact,
}: {
  label: string;
  count: number;
  targetPct: number;
  colorClass: string;
  isCorrect: boolean;
  isMine: boolean;
  staggerMs: number;
  ready: boolean;
  revealed: boolean;
  resetKey: string;
  compact: boolean;
}) {
  const animatedCount = useCountUp(count, COUNT_UP_MS, resetKey);
  const width = ready ? `${targetPct}%` : "0%";
  const barHeight = compact ? "h-3" : "h-7";

  // Once revealed: lift the correct row, dim the wrong ones.
  const rowDim = revealed && !isCorrect;
  const rowLift = revealed && isCorrect;

  return (
    <div
      className="space-y-1"
      style={{
        opacity: rowDim ? 0.45 : 1,
        transform: rowLift ? "scale(1.02)" : "scale(1)",
        filter: rowDim ? "saturate(0.55)" : "saturate(1)",
        transformOrigin: "left center",
        transition:
          "opacity 600ms ease-out, transform 600ms cubic-bezier(0.22, 1, 0.36, 1), filter 600ms ease-out",
      }}
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span
          className={
            (revealed && isCorrect
              ? "text-green-300 font-semibold"
              : "text-slate-300") + " truncate flex items-center"
          }
        >
          {label}
          {revealed && isCorrect && (
            <span
              className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-slate-950 text-xs font-bold"
              style={{ animation: "badgePop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
              aria-label="Correct answer"
            >
              ✓
            </span>
          )}
          {isMine && (
            <span className="text-slate-500 ml-2 text-xs">(you)</span>
          )}
        </span>
        <span
          className={
            "font-mono tabular-nums " +
            (revealed && isCorrect ? "text-green-200" : "text-slate-400")
          }
        >
          {animatedCount}
        </span>
      </div>
      <div
        className={`relative ${barHeight} bg-slate-900/80 rounded-full overflow-visible border border-slate-800/60`}
      >
        <div
          className={`${colorClass} h-full rounded-full ${
            revealed && isCorrect
              ? "ring-2 ring-green-300/80"
              : ""
          }`}
          style={{
            width,
            transition: `width ${BAR_GROW_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${staggerMs}ms, box-shadow 600ms ease-out`,
            boxShadow: revealed && isCorrect
              ? "0 0 32px rgba(74, 222, 128, 0.75)"
              : "none",
            animation: revealed && isCorrect
              ? "correctPulse 1800ms ease-in-out 600ms infinite"
              : undefined,
          }}
        />
        {revealed && isCorrect && !compact && <ConfettiBurst />}
      </div>
    </div>
  );
}

/**
 * Lightweight CSS confetti — no deps. ~16 particles fan out from the
 * top-left of the correct bar with randomized direction, distance and
 * rotation supplied via CSS custom properties.
 */
function ConfettiBurst() {
  const particles = useMemo(() => {
    const colors = ["#f87171", "#60a5fa", "#facc15", "#4ade80", "#f472b6", "#a78bfa"];
    return Array.from({ length: 16 }, (_, i) => {
      const angle = (-30 + Math.random() * 60) * (Math.PI / 180);
      const distance = 60 + Math.random() * 80;
      const x = Math.sin(angle) * distance;
      const y = 40 + Math.random() * 60;
      const r = (Math.random() * 2 - 1) * 360;
      const color = colors[i % colors.length];
      const left = 4 + Math.random() * 40; // % across the bar's left region
      const delay = Math.random() * 120;
      return { x, y, r, color, left, delay, i };
    });
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p) => (
        <span
          key={p.i}
          aria-hidden
          className="absolute top-0 w-1.5 h-2.5 rounded-sm"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            ["--confetti-x" as string]: `${p.x}px`,
            ["--confetti-y" as string]: `${p.y}px`,
            ["--confetti-r" as string]: `${p.r}deg`,
            animation: `confettiFall 1400ms cubic-bezier(0.22, 1, 0.36, 1) ${p.delay}ms both`,
          }}
        />
      ))}
    </div>
  );
}

export interface LeaderboardRow {
  playerId: string;
  nickname: string;
  score: number;
}

export interface AnimatedLeaderboardProps {
  rows: LeaderboardRow[];
  /** Highlight #1 with a winner treatment (used on the final screen). */
  highlightWinner?: boolean;
  /** Highlight a specific player (their own row, in Play view). */
  highlightPlayerId?: string;
  /** Key that, when changed, restarts the animation. */
  resetKey: string | number;
  title?: string;
  /** When true, stagger entry from a longer delay for dramatic final reveal. */
  dramatic?: boolean;
}

export function AnimatedLeaderboard({
  rows,
  highlightWinner = false,
  highlightPlayerId,
  resetKey,
  title = "Leaderboard",
  dramatic = false,
}: AnimatedLeaderboardProps) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <LeaderboardItem
            key={r.playerId}
            row={r}
            rank={i}
            isWinner={highlightWinner && i === 0}
            isMine={highlightPlayerId === r.playerId}
            resetKey={`${resetKey}:${r.playerId}`}
            delayMs={(dramatic ? 250 : 120) + i * (dramatic ? 220 : 110)}
            dramatic={dramatic}
          />
        ))}
      </ol>
    </div>
  );
}

function LeaderboardItem({
  row,
  rank,
  isWinner,
  isMine,
  resetKey,
  delayMs,
  dramatic,
}: {
  row: LeaderboardRow;
  rank: number;
  isWinner: boolean;
  isMine: boolean;
  resetKey: string;
  delayMs: number;
  dramatic: boolean;
}) {
  // Fade-and-slide entry; score begins counting once the row has appeared.
  const [shown, setShown] = useState(false);
  const [scoreStarted, setScoreStarted] = useState(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    setShown(false);
    setScoreStarted(false);
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    timersRef.current.push(
      window.setTimeout(() => setShown(true), delayMs),
      window.setTimeout(() => setScoreStarted(true), delayMs + 250)
    );
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };
  }, [resetKey, delayMs]);

  const score = useCountUp(
    scoreStarted ? row.score : 0,
    dramatic ? 1600 : 900,
    `${resetKey}:${scoreStarted}`
  );

  const baseClasses =
    "flex items-center justify-between border rounded-lg px-4 py-3 will-change-transform";
  const tone = isWinner
    ? "bg-gradient-to-r from-yellow-500/25 via-amber-500/15 to-yellow-500/10 border-yellow-500/60 shadow-[0_0_24px_rgba(250,204,21,0.25)]"
    : isMine
      ? "bg-fuchsia-950/30 border-fuchsia-700"
      : "bg-slate-900 border-slate-800";

  const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : null;

  return (
    <li
      className={`${baseClasses} ${tone}`}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(12px)",
        transition:
          "opacity 480ms ease-out, transform 480ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span
          className={
            "font-mono text-sm w-6 text-center " +
            (isWinner ? "text-yellow-300" : "text-slate-500")
          }
        >
          {medal ?? rank + 1}
        </span>
        <span
          className={
            "truncate " +
            (isWinner ? "text-yellow-100 font-semibold" : "text-slate-100")
          }
        >
          {row.nickname}
        </span>
      </span>
      <span
        className={
          "font-mono tabular-nums " +
          (isWinner ? "text-yellow-200 text-lg font-semibold" : "text-slate-300")
        }
      >
        {score}
      </span>
    </li>
  );
}
