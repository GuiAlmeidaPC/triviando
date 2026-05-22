// Minimal WebSocket client wrapper for the live game protocol.
// One ws connection per page; subscribers listen by message type.
// Reconnects automatically with exponential backoff while open.

export interface Envelope<T = unknown> {
  type: string;
  data: T;
}

type Listener = (env: Envelope) => void;

const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;

export class LiveSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private opened = false;
  private queue: string[] = [];
  private closedByUser = false;
  private backoff = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private url: string) {}

  connect() {
    if (this.ws || this.closedByUser) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.opened = true;
      this.backoff = MIN_BACKOFF_MS;
      for (const m of this.queue) this.ws!.send(m);
      this.queue = [];
    };
    this.ws.onmessage = (e) => {
      let env: Envelope;
      try {
        env = JSON.parse(e.data);
      } catch (err) {
        console.warn("ws: bad envelope", err);
        return;
      }
      this.listeners.forEach((l) => {
        try {
          l(env);
        } catch (err) {
          console.error("ws listener error", err);
        }
      });
    };
    this.ws.onclose = () => {
      this.opened = false;
      this.ws = null;
      if (!this.closedByUser) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      // Browser will fire onclose right after — let that path handle reconnect.
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send(type: string, data: unknown) {
    const payload = JSON.stringify({ type, data });
    if (this.opened && this.ws) {
      this.ws.send(payload);
    } else {
      this.queue.push(payload);
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

export function wsURL(path = "/ws"): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
