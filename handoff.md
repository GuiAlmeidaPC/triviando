# Handoff: Live WebSocket Reconnection & Re-authentication

This document records the mobile live-sync issue we hit in **Triviando**, what fixed it, and the subtle pitfall that caused an earlier attempt at the same fix to be reverted.

---

## 1. The Original Symptom

- When a host took a long time before advancing to the next question, players' mobile devices stopped receiving state changes automatically.
- A locked/sleeping phone, once unlocked, would stay stuck on the previous view until the page was manually refreshed.
- A phone that stayed active *did* receive updates correctly.

## 2. Root Cause

While we already had robust reconnection triggers (heartbeats, `online` event, visibility API, CPU/clock-drift detector — see [ws.ts](file:///home/gui/projects/triviando/frontend/src/lib/ws.ts)), the **WebSocket connection state machine** had a fundamental gap:

- When `LiveSocket` reconnected in the background, it opened a brand new WebSocket.
- It never re-sent the auth message (`player.attach` / `host.attach`).
- The server saw a fresh anonymous socket with no `playerId` / `playerToken`, so it never delivered broadcasts to it.

The previous registration message was only ever queued once, before the *initial* `onopen`. After the queue drained, there was nothing left to replay.

---

## 3. The Fix (shipped in commit `d7a7ddd`)

Approach A from the original handoff — handshake replay — implemented with one extra refinement that the earlier reverted attempt (`e0ee754`) missed.

### `frontend/src/lib/ws.ts`

- New private field `handshake: { type, data } | null`.
- New `setHandshake(type, data)` — **store only**, does not send. The handshake is sent automatically by the next `onopen`.
- New `clearHandshake()` and cleared in `close()`.
- `onopen` now sends the stored handshake **before** draining `this.queue`, so the server re-associates the new socket with the existing session before any other queued messages land.

### `frontend/src/pages/Play.tsx`

- Initial join/attach uses `sock.setHandshake(...)` instead of `sock.send(...)`.
- On `HelloPlayer`, the handshake is **upgraded** to `PlayerAttach` with the newly received `playerToken`. This is the critical step: without it, a reconnect after a fresh `PlayerJoin` would replay the join and the server would mint a duplicate player.

### `frontend/src/pages/Host.tsx`

- Same pattern: initial `HostCreate` / `HostAttach` via `setHandshake`.
- On `HelloHost`, handshake is upgraded to `HostAttach` with the now-known `gameId` + `hostToken`.

---

## 4. Why the Earlier Attempt (`e0ee754`) Was Reverted

If you grep the git history you'll see a previous "feat: implement automatic handshake replay…" commit that was reverted in `960cec5`. Two subtle traps to avoid if you ever rework this code:

1. **Do not auto-send the handshake from `setHandshake` when the socket is already open.** When `HelloPlayer` triggers the upgrade to `PlayerAttach`, the socket is live — sending immediately would round-trip another `HelloPlayer`, which resets local state (`setMe`, localStorage, phase logic) and can cause UI flicker or worse. The handshake only needs to be *ready* for the next reconnect.
2. **You must upgrade `PlayerJoin` → `PlayerAttach` after `HelloPlayer`.** If you forget this, every reconnect replays the original `PlayerJoin`, and the server creates a duplicate player on each one.

The current implementation handles both: `setHandshake` is store-only, and Play/Host upgrade their handshake the moment they have a token.

---

## 5. Verification

- Built and deployed (`make deploy`) on 2026-05-24.
- Confirmed working on mobile: phone sleep → unlock now resumes live updates without a manual refresh.

If this regresses, first place to look is `ws.ts:onopen` (handshake-before-queue ordering) and the `HelloPlayer` / `HelloHost` handlers in Play.tsx / Host.tsx (handshake upgrade still calling `setHandshake` with the latest token).
