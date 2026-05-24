# Handoff Documentation: Live WebSocket Reconnection & Re-authentication Issue

This document provides a comprehensive summary of the real-time sync issues experienced on mobile devices in **Triviando**, our attempts to solve them, and a **precise diagnosis of the final root cause** to help the next AI coding assistant fix it instantly.

---

## 1. Executive Summary

- **The Symptom**: When a host takes a long time before advancing to the next question, players' mobile devices do not automatically receive the state change. If a player's phone screen turns off (goes to sleep/locks), unlocking the screen leaves them stuck on the previous view until they manually refresh the page.
- **What Works**: A phone that stays active (screen never turns off) *does* receive the update automatically.
- **The Diagnosis**: While we successfully built highly resilient reconnection triggers (heartbeats, online status, clock drift detectors), we overlooked a fundamental flaw in the **WebSocket connection state machine**:
  - When the frontend `LiveSocket` successfully reconnects in the background, it creates a fresh WebSocket connection.
  - However, **it never re-authenticates or re-attaches** to the active game room.
  - The server sees a new connection but has no player context (`playerId`, `playerToken`) for it, so it remains a silent anonymous socket. The player never receives broadcasts.

---

## 2. Technical Stack & Architecture

- **Backend**: Go (using `github.com/go-chi/chi/v5` for routing and `github.com/coder/websocket` for real-time sockets). Live game states are maintained in-memory inside the `Hub` struct.
- **Frontend**: React + Vite + Tailwind + TypeScript.
- **WebSocket Protocol**: All wire messages use an envelope:
  ```json
  {
    "type": "message.type",
    "data": { ... }
  }
  ```
- **Authentication**: Players register via `player.join` and get a unique `playerId` and `playerToken` returned in `hello.player`. If they disconnect, they must send `player.attach` with their token to resume their session:
  ```json
  {
    "type": "player.attach",
    "data": {
      "gameId": "GAME_ID",
      "playerToken": "PLAYER_TOKEN"
    }
  }
  ```

---

## 3. What Was Implemented So Far

To address the aggressive sleep/lock behavior of mobile browsers, we implemented a robust set of connection recovery triggers inside [ws.ts](file:///home/gui/projects/triviando/frontend/src/lib/ws.ts):

1. **Heartbeat (Ping/Pong)**: Sends a `"ping"` every 10 seconds. If a `"pong"` isn't received within 5 seconds, it closes the socket and triggers a reconnect (combats half-open TCP connections).
2. **Network `online` Event Listener**: Instantly triggers reconnection when the phone wakes up and recovers Wi-Fi/cellular connection.
3. **Visibility API Listener**: Triggers checking/reconnecting when the page transition state becomes `"visible"`.
4. **Clock-Drift / CPU Suspension Detector**: Runs a timer every 2 seconds. If the difference between two ticks exceeds 5 seconds, it detects that the mobile OS suspended the browser process and immediately calls `forceReconnect()`.
5. **Fast Clean Reconnections (`forceReconnect`)**: Cleanly disposes of the old socket, resets the exponential backoff delay, and starts a fresh connection instantly.

---

## 4. The Core Bug: Missing Re-authentication

### Why the Current Code Fails
Let's trace what happens when `Play.tsx` mounts:
1. `Play.tsx` instantiates `LiveSocket` and calls `sock.connect()`.
2. It immediately queues the attach message:
   ```typescript
   sock.send(MsgType.PlayerAttach, { gameId, playerToken });
   ```
3. Because the WebSocket connection is not open yet, the message is placed in `this.queue`.
4. Once `onopen` fires, the socket drains `this.queue` and sends `PlayerAttach` to the server. The connection is now registered!
5. **The device sleeps and wakes up**: The clock drift detector fires, calling `forceReconnect()`.
6. `forceReconnect()` creates a brand new connection (`this.ws = new WebSocket(...)`).
7. `onopen` fires for this new connection.
8. **CRITICAL ERROR**: `this.queue` is empty! The registration message `PlayerAttach` is **never re-sent**.
9. The server accepts the socket but has no idea who it belongs to. The player is left stranded.

---

## 5. How to Fix It (Instructions for the Next AI)

There are two clean ways to solve this. Choose the one that fits best:

### Approach A: Auto-Replay Handshake (Recommended)
Teach `LiveSocket` to remember the initial registration handshake message and automatically replay it on every reconnection.

1. Add a `handshake` field to `LiveSocket` in [ws.ts](file:///home/gui/projects/triviando/frontend/src/lib/ws.ts):
   ```typescript
   private handshake: { type: string; data: unknown } | null = null;
   ```
2. Create a `setHandshake` method:
   ```typescript
   setHandshake(type: string, data: unknown) {
     this.handshake = { type, data };
     this.send(type, data);
   }
   ```
3. In `onopen`, automatically send the handshake if it exists:
   ```typescript
   this.ws.onopen = () => {
     this.opened = true;
     this.backoff = MIN_BACKOFF_MS;
     
     // Send handshake first
     if (this.handshake) {
       this.send(this.handshake.type, this.handshake.data);
     }
     
     for (const m of this.queue) this.ws!.send(m);
     this.queue = [];
     this.startHeartbeat();
     this.startSleepDetector();
   };
   ```
4. Update `Play.tsx` and `Host.tsx` to use `sock.setHandshake(...)` instead of `sock.send(...)` for their initial join/attach commands.

---

### Approach B: Expose an Connection Event Callback
Allow components to subscribe to `onConnect` events so they can re-send authentication whenever the socket opens.

1. Add a callback registry inside `LiveSocket` in [ws.ts](file:///home/gui/projects/triviando/frontend/src/lib/ws.ts):
   ```typescript
   private connectListeners = new Set<() => void>();
   
   onConnect(cb: () => void): () => void {
     this.connectListeners.add(cb);
     if (this.opened) cb(); // If already open, trigger immediately
     return () => this.connectListeners.delete(cb);
   }
   ```
2. Trigger the callbacks inside `onopen`:
   ```typescript
   this.ws.onopen = () => {
     this.opened = true;
     this.backoff = MIN_BACKOFF_MS;
     for (const m of this.queue) this.ws!.send(m);
     this.queue = [];
     
     // Notify subscribers to re-authenticate
     this.connectListeners.forEach((cb) => cb());
     
     this.startHeartbeat();
     this.startSleepDetector();
   };
   ```
3. In [Play.tsx](file:///home/gui/projects/triviando/frontend/src/pages/Play.tsx), listen to `onConnect` inside the `useEffect` block and send the attach payload:
   ```typescript
   useEffect(() => {
     const sock = new LiveSocket(wsURL());
     sockRef.current = sock;
     
     const unsubConnect = sock.onConnect(() => {
       const rawSession = localStorage.getItem("triviando.activePlayerSession");
       // Parse and send PlayerAttach or PlayerJoin
       sock.send(MsgType.PlayerAttach, { gameId: storedSession.gameId, playerToken: storedSession.playerToken });
     });
     
     sock.connect();
     return () => {
       unsubConnect();
       sock.close();
     };
   }, [pin, nickname]);
   ```

---

Good luck to the next AI assistant! This is a highly polished project, and fixing this final reconnection handshake is the last piece needed to make the mobile play loop perfectly seamless.
