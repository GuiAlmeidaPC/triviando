# Triviando

Web-based real-time trivia/quiz app. Go backend, React+Vite+Tailwind frontend.
See [SPEC.md](./SPEC.md) for the design.

## Quickstart

Prereqs: Go 1.25+, Node 22+.

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

Host nginx serves `frontend/dist`; a systemd user service runs the backend on `127.0.0.1:8001`. See [SPEC.md §9](./SPEC.md).

## Automatic deployment

Every push to `main` that passes CI deploys to https://triviando.gapc10.tech.
Pull requests and other branches run the tests and production build without deploying.

[The workflow](./.github/workflows/ci.yml) runs the Go tests and builds the static
Linux/amd64 backend and frontend once, then passes those artifacts to the deploy
job. It uploads them over SSH, runs [deploy/release.sh](./deploy/release.sh),
restarts `triviando`, and checks the backend and public site. Deployments run one
at a time. Only `/srv/triviando/backend/bin/triviando` and
`/srv/triviando/frontend/dist/` are replaced; SQLite data stays in
`/srv/triviando/data/`.

To configure or rotate CI credentials for the existing VPS deployment, run:

```bash
bash deploy/setup-ci.sh
```

This requires `gh` signed in to GitHub and working SSH access to
`deploy@187.127.26.58`, with its host key already trusted in `~/.ssh/known_hosts`.
The script creates a separate `triviando-github-deploy` SSH key and sets the
`DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` repository secrets. It preserves other
SSH keys, including Divi's. The CI key can run commands as the VPS `deploy` user;
only trusted contributors should be able to push to `main` or edit the workflow.

Each deployment restarts the backend, so active games held in memory end.
Quizzes, accounts, and finished-game history remain in SQLite.

Manual deployment is also available:

```bash
make deploy
```

The host UI now keeps a recent finished-game history in SQLite and surfaces it on the quiz list page.
