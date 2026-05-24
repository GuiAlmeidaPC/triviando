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
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // Sleep detection & multi-trigger listeners
  private sleepDetectorTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickTime = Date.now();

  private handshake: { type: string; data: unknown } | null = null;

  constructor(private url: string) {
    if (typeof window !== "undefined") {
      window.addEventListener("visibilitychange", this.handleVisibilityChange);
      window.addEventListener("online", this.handleOnline);
    }
  }

  setHandshake(type: string, data: unknown) {
    this.handshake = { type, data };
    this.send(type, data);
  }

  connect() {
    if (this.ws || this.closedByUser) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.opened = true;
      this.backoff = MIN_BACKOFF_MS;

      // Replay handshake first if it exists
      if (this.handshake) {
        const payload = JSON.stringify(this.handshake);
        this.ws!.send(payload);
      }

      for (const m of this.queue) {
        if (this.handshake && m === JSON.stringify(this.handshake)) {
          continue;
        }
        this.ws!.send(m);
      }
      this.queue = [];
      this.startHeartbeat();
      this.startSleepDetector();
    };
    this.ws.onmessage = (e) => {
      let env: Envelope;
      try {
        env = JSON.parse(e.data);
      } catch (err) {
        console.warn("ws: bad envelope", err);
        return;
      }
      if (env.type === "pong") {
        this.handlePong();
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
      this.stopHeartbeat();
      this.stopSleepDetector();
      if (!this.closedByUser) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      // Browser will fire onclose right after — let that path handle reconnect.
    };
  }

  private handleVisibilityChange = () => {
    if (this.closedByUser) return;
    if (document.visibilityState === "visible") {
      console.log("ws: visibility changed to visible - checking connection integrity");
      this.forceReconnectIfStale();
    }
  };

  private handleOnline = () => {
    if (this.closedByUser) return;
    console.log("ws: system online event fired - forcing fast reconnect");
    this.forceReconnect();
  };

  private startSleepDetector() {
    this.stopSleepDetector();
    this.lastTickTime = Date.now();
    this.sleepDetectorTimer = setInterval(() => {
      const now = Date.now();
      const delta = now - this.lastTickTime;
      // We expect a tick every 2000ms. If it took more than 5000ms, the JS execution was suspended.
      if (delta > 5000) {
        console.warn(`ws: sleep/suspension detected (CPU paused for ${delta}ms). Reconnecting immediately.`);
        this.forceReconnect();
      }
      this.lastTickTime = now;
    }, 2000);
  }

  private stopSleepDetector() {
    if (this.sleepDetectorTimer) {
      clearInterval(this.sleepDetectorTimer);
      this.sleepDetectorTimer = null;
    }
  }

  private forceReconnectIfStale() {
    if (!this.ws || !this.opened) {
      this.forceReconnect();
    } else {
      // It thinks it's open, but we just became visible; let's send a ping to verify.
      // If we don't get a pong immediately (stale TCP), the pong timeout will close and reconnect.
      this.sendPing();
    }
  }

  private forceReconnect() {
    if (this.closedByUser) return;
    console.log("ws: forcing clean disconnect for immediate reconnection");
    
    this.stopHeartbeat();
    this.stopSleepDetector();
    
    if (this.ws) {
      this.ws.onclose = null; // Unbind callback so standard onclose doesn't invoke double reconnect
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
    
    this.opened = false;
    this.backoff = MIN_BACKOFF_MS; // reset backoff for instant connection
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.connect();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, 10000); // Send ping every 10 seconds
  }

  private sendPing() {
    if (!this.opened || !this.ws) return;
    
    // If a pong timeout is already active, do not overwrite it
    if (this.pongTimeoutTimer) return;

    this.send("ping", {});
    this.pongTimeoutTimer = setTimeout(() => {
      console.warn("ws: heartbeat timeout (no pong), closing connection");
      // Use forceReconnect here as it handles cleanup cleanly
      this.forceReconnect();
    }, 5000); // 5 seconds grace period for pong response
  }

  private handlePong() {
    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
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
    if (typeof window !== "undefined") {
      window.removeEventListener("visibilitychange", this.handleVisibilityChange);
      window.removeEventListener("online", this.handleOnline);
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.stopSleepDetector();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

export function wsURL(path = "/ws"): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
