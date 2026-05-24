# Triviando

Web-based real-time trivia/quiz app. Go backend, React+Vite+Tailwind frontend.
See [SPEC.md](./SPEC.md) for the design.

## Quickstart

Prereqs: Go 1.24+, Node 20+.

```bash
# Terminal 1 — backend on :8001
make dev-backend

# Terminal 2 — Vite dev server on :5173 (proxies /api and /ws to :8001)
cd frontend && npm install   # first time only
make dev-frontend
```

Then open http://localhost:5173.

## Production build

```bash
make build
# produces backend/bin/triviando and frontend/dist/
```

Deploy: see [SPEC.md §9](./SPEC.md) — host nginx serves `frontend/dist`, systemd user service runs the backend on `127.0.0.1:8001`.

```bash
make deploy
```

The host UI now keeps a recent finished-game history in SQLite and surfaces it on the quiz list page.
