# Triviando — Specification

A web-based real-time trivia/quiz app in the style of Kahoot. Hosts create quizzes and run live games; players join via a short PIN from any device and answer on a timer; scores update live and a leaderboard is shown between questions.

---

## 1. Goals & scope

**MVP goals**
- A host can create a quiz (multiple-choice questions, optional time limit per question, correct answer).
- A host can launch a *game session* from a quiz, getting a short join PIN.
- Players join with the PIN and a nickname — no account required.
- Host drives the game (next question, reveal answer). Players answer on their device. Live leaderboard between questions.
- Scoring rewards correctness and speed.
- Final results screen at end.

**Out of scope for MVP (revisit later)**
- Accounts / persistent player profiles
- Team mode, power-ups, media (images/audio) in questions
- Importing from Kahoot / public quiz library
- Mobile native apps
- i18n

---

## 2. Tech stack

**Backend** — Go
- HTTP router: `chi` (small, idiomatic)
- WebSockets: `nhooyr.io/websocket` (modern, context-aware) or `gorilla/websocket`
- Storage: SQLite via `modernc.org/sqlite` (pure Go, no CGO) for MVP. Stores quizzes, questions, and game history. Live game state lives in memory.
- Config via env vars; single static binary.

**Frontend** — React + Vite + Tailwind
- Routing: `react-router`
- State: lightweight — React state + a small store (`zustand`) for the game session.
- WebSocket client: native `WebSocket` wrapped in a hook.
- Build output is static; served by the Go binary in production.

**Why this shape:** small Go binary handles API + WebSockets; nginx on the VPS serves the built frontend static files directly (cheaper than proxying, and matches the existing VPS deploy template). One repo, two artifacts (`backend` binary, `frontend/dist`).

---

## 3. Domain model

```
Quiz
  id, title, created_at, owner_token (anonymous owner for MVP)
  Questions: [Question]

Question
  id, quiz_id, position, prompt, time_limit_seconds, points
  Choices: [Choice]  (typically 4; one marked correct)

Choice
  id, question_id, text, is_correct

Game (live, in-memory; persisted summary on end)
  id, pin (6-digit), quiz_id, host_conn, state, current_question_idx, started_at
  Players: map[playerID]Player
  Answers: map[questionID]map[playerID]Answer

Player (in-memory)
  id, nickname, conn, score, joined_at

Answer
  player_id, question_id, choice_id, answered_at, awarded_points
```

State machine for a game:
`lobby → question_active → question_reveal → (next question | finished)`

---

## 4. Real-time protocol (WebSocket)

One WS endpoint, JSON messages with a `type` field. Two roles connect to the same game: **host** and **player**.

**Client → server**
- `host.create` `{ quizId }` → returns `pin`, `gameId`
- `host.start` — move from lobby to first question
- `host.next` — advance to next question (or finish)
- `host.reveal` — force-reveal before timer expires
- `player.join` `{ pin, nickname }`
- `player.answer` `{ choiceId }`

**Server → client (broadcasts scoped to a game)**
- `lobby.update` `{ players: [...] }`
- `question.start` `{ idx, prompt, choices: [{id,text}], timeLimit, endsAt }`
- `question.reveal` `{ correctChoiceId, perChoiceCounts, leaderboard }`
- `game.finished` `{ leaderboard }`
- `error` `{ code, message }`

Notes:
- Server is authoritative on time: `endsAt` is a server timestamp; clients render countdowns from it.
- Reconnect: each client gets a session token on first message; reconnect with `{ token }` resumes role + score.

---

## 5. HTTP API (host-side editing)

Anonymous "owner token" stored in localStorage identifies quiz ownership for MVP — no real auth.

- `POST /api/quizzes` — create quiz
- `GET /api/quizzes/:id` — fetch (owner-only for edit; public read by ID is fine for MVP)
- `PUT /api/quizzes/:id` — update title & questions (full replace for simplicity)
- `DELETE /api/quizzes/:id`
- `POST /api/games` `{ quizId }` — create live game, returns `{ gameId, pin, wsUrl }`
- `GET /healthz`

WS: `GET /ws?gameId=…` (host) or `/ws` then `player.join` (players).

---

## 6. Frontend pages

- `/` — landing: "Join with PIN" + "Create a quiz"
- `/join` — enter PIN + nickname → lobby
- `/play/:gameId` — player view (lobby → question → wait → reveal → final)
- `/edit/:quizId` — quiz editor (questions, choices, mark correct, time/points)
- `/host/:gameId` — host control: PIN display, lobby, current question + timer, reveal, next, results
- `/present/:gameId` *(optional, post-MVP)* — big-screen view for projector

Tailwind for styling; a small set of reusable components (Button, Card, Choice, Timer, Leaderboard).

---

## 7. Scoring

Per question, when correct:
`points = base * (0.5 + 0.5 * (timeRemaining / timeLimit))`
Wrong/no answer = 0. `base` default 1000, configurable per question. Same formula as Kahoot's, roughly.

---

## 8. Project layout

```
triviando/
  backend/
    cmd/triviando/main.go
    internal/
      http/        # routes, handlers, static FS
      ws/          # hub, game runtime, message types
      game/        # state machine, scoring (pure, testable)
      store/       # sqlite repo
      config/
    migrations/
  frontend/
    src/
      pages/
      components/
      lib/ws.ts
      lib/api.ts
      store/
    index.html
    vite.config.ts
    tailwind.config.js
  Makefile        # build, run, test, package
  SPEC.md
  README.md
```

Build: `make build` → `vite build` produces `frontend/dist/`; `go build` produces `backend/bin/triviando`. Both shipped to `/srv/triviando/` on the VPS.

---

## 9. Deployment (VPS)

Follows the project's standard VPS deploy template (`deploy-new-project.md`), **Option A — direct (no Docker)**.

- **Host**: `187.127.26.58`, base domain `gapc10.tech`
- **Subdomain**: `triviando.gapc10.tech` (A record → VPS IP)
- **Code location**: `/srv/triviando` (git clone of `GuiAlmeidaPC/triviando`)
- **Backend port**: `127.0.0.1:8001` (next free; see port reference in deploy template)
- **Process**: systemd *user* service `~/.config/systemd/user/triviando.service` running `/srv/triviando/backend/bin/triviando`; `loginctl enable-linger deploy` so it survives logout.
- **TLS**: `certbot --nginx -d triviando.gapc10.tech`.
- **DB**: SQLite file at `/srv/triviando/data/triviando.db`; nightly `sqlite3 .backup` cron, weekly rotation.
- **Redeploy**: `git pull && make build && systemctl --user restart triviando`. CI/CD deferred post-MVP.

### nginx server block (sketch)

Differs from the template in two ways: a `/ws` location with WebSocket upgrade headers, and a longer read timeout for long-lived connections.

```nginx
server {
    server_name triviando.gapc10.tech;

    location /assets/ {
        alias /srv/triviando/frontend/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        alias /srv/triviando/frontend/dist/;
        try_files $uri $uri/ /index.html;
        location = /index.html { add_header Cache-Control "no-cache"; }
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8001/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    listen 80;
}
```

---

## 10. Milestones

1. **Skeleton** — Go server, chi router, embed frontend, healthz, Vite+Tailwind hello page.
2. **Quiz CRUD** — SQLite store, editor UI, persistence.
3. **Game runtime (in-memory)** — hub, game state machine, host create + PIN, player join, lobby.
4. **Play loop** — question.start/reveal cycle, scoring, leaderboard.
5. **Polish** — reconnect, error states, mobile layout pass.
6. **Deploy** — systemd unit, Caddy, first prod deploy.
7. **Post-MVP** — images in questions, accounts, presenter view, public quiz library.

---

## 11. Open questions (decide before/while building)

- **Auth model:** stay anonymous-token for MVP, or add a minimal email/password (or magic link) from day one? Anonymous is faster but data is tied to a browser.
- **Persistence of live games:** keep in-memory only (MVP) vs. snapshot to SQLite for crash-resume.
- **Domain name & TLS host** for the deploy.
- **Max players per game** — affects WS scaling assumptions. MVP target: 100.
- **Question types** — MVP is multiple-choice only; do we want true/false as a second type now or later?
