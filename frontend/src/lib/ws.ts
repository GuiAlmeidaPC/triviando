// Minimal WebSocket client wrapper for the live game protocol.
// One ws connection per page; subscribers listen by message type.

export interface Envelope<T = unknown> {
  type: string;
  data: T;
}

type Listener = (env: Envelope) => void;

export class LiveSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private opened = false;
  private queue: string[] = [];

  constructor(private url: string) {}

  connect() {
    if (this.ws) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.opened = true;
      for (const m of this.queue) this.ws!.send(m);
      this.queue = [];
    };
    this.ws.onmessage = (e) => {
      try {
        const env: Envelope = JSON.parse(e.data);
        this.listeners.forEach((l) => l(env));
      } catch {
        // ignore
      }
    };
    this.ws.onclose = () => {
      this.opened = false;
      this.ws = null;
    };
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
    this.ws?.close();
    this.ws = null;
  }
}

export function wsURL(path = "/ws"): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
