import { useEffect, useMemo, useRef, useState } from "react";

const choiceBarColors = [
  "bg-red-500",
  "bg-blue-500",
  "bg-yellow-500",
  "bg-green-500",
];

/**
 * Animate a number from 0 → target over `duration` ms with ease-out cubic.
 * Restarts whenever the resetKey changes.
 */
function useCountUp(target: number, duration = 1200, resetKey: unknown = target) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    if (target === 0) return;
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
 * Horizontal bar chart where bars start at width 0 and animate to their
 * final share, with staggered entry. Vote counts tick up alongside the bars.
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

  // Trigger width animation on mount / reset by toggling a "ready" flag.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const id = window.setTimeout(() => setReady(true), 60);
    return () => window.clearTimeout(id);
  }, [resetKey]);

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
        // Bars scale relative to the leading choice so the winner reaches ~100%
        // — visually more dramatic than scaling by share of total votes.
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
            staggerMs={i * 140}
            ready={ready}
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
  resetKey: string;
  compact: boolean;
}) {
  const animatedCount = useCountUp(count, 1400, resetKey);
  const width = ready ? `${targetPct}%` : "0%";
  const barHeight = compact ? "h-3" : "h-6";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span
          className={
            (isCorrect
              ? "text-green-300 font-semibold"
              : "text-slate-300") + " truncate"
          }
        >
          {label}
          {isCorrect && <span className="ml-1.5">✓</span>}
          {isMine && (
            <span className="text-slate-500 ml-2 text-xs">(you)</span>
          )}
        </span>
        <span
          className={
            "font-mono tabular-nums " +
            (isCorrect ? "text-green-200" : "text-slate-400")
          }
        >
          {animatedCount}
        </span>
      </div>
      <div
        className={`${barHeight} bg-slate-900/80 rounded-full overflow-hidden border border-slate-800/60`}
      >
        <div
          className={`${colorClass} h-full rounded-full ${
            isCorrect ? "shadow-[0_0_18px_rgba(74,222,128,0.45)]" : "opacity-60"
          }`}
          style={{
            width,
            transition: `width 1400ms cubic-bezier(0.22, 1, 0.36, 1) ${staggerMs}ms`,
          }}
        />
      </div>
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
