import { useEffect, useState } from "react";

// useCountdown returns the seconds remaining until `endsAt` (ms-since-epoch),
// updating ~10x per second. Clamps to 0.
export function useCountdown(endsAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [endsAt]);
  if (endsAt === null) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
