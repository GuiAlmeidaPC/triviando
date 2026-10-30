#!/usr/bin/env bash
# Run locally once for the existing VPS deployment. Creates a dedicated CI
# key, authorizes it on the server, and stores the key and trusted host key
# in this repository's GitHub Actions secrets. No sudo is needed.
set -euo pipefail

HOST=deploy@187.127.26.58
IP=187.127.26.58
REPO=GuiAlmeidaPC/triviando
KEY_COMMENT=triviando-github-deploy
KEY_DIR="$(mktemp -d)"
trap 'rm -rf "$KEY_DIR"' EXIT

for cmd in ssh ssh-keygen gh; do
	command -v "$cmd" >/dev/null
done
gh auth status >/dev/null 2>&1

# Pin the host key already trusted locally; never use an unverified keyscan.
ssh-keygen -F "$IP" | sed '/^#/d' > "$KEY_DIR/known_hosts"
test -s "$KEY_DIR/known_hosts"
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15)

# Expand the preflight command on the VPS.
# shellcheck disable=SC2016
"${SSH[@]}" "$HOST" '
	set -e
	test "$(uname -sm)" = "Linux x86_64"
	test -w /srv/triviando/backend/bin
	test -w /srv/triviando/frontend/dist
	command -v rsync >/dev/null
	command -v curl >/dev/null
	command -v flock >/dev/null
	systemctl --user is-active --quiet triviando
	curl -fsS --max-time 5 http://127.0.0.1:8001/healthz >/dev/null'

ssh-keygen -q -t ed25519 -N '' -C "$KEY_COMMENT" -f "$KEY_DIR/key"
pubkey="$(cat "$KEY_DIR/key.pub")"

# Keep existing keys until the new GitHub secret has been saved successfully.
"${SSH[@]}" "$HOST" "umask 077; mkdir -p ~/.ssh; printf 'restrict %s\n' '$pubkey' >> ~/.ssh/authorized_keys"
"${SSH[@]}" -o IdentitiesOnly=yes -o ControlPath=none -i "$KEY_DIR/key" "$HOST" true

gh secret set DEPLOY_SSH_KEY --repo "$REPO" < "$KEY_DIR/key"
gh secret set DEPLOY_KNOWN_HOSTS --repo "$REPO" < "$KEY_DIR/known_hosts"

# Remove older Triviando CI keys, preserving other projects and login keys.
"${SSH[@]}" "$HOST" "bash -s -- '$pubkey' '$KEY_COMMENT'" <<'REMOTE'
set -euo pipefail
pubkey="$1"
comment="$2"
ak="$HOME/.ssh/authorized_keys"
next="$(mktemp "$HOME/.ssh/authorized_keys.triviando.XXXXXX")"
trap 'rm -f "$next"' EXIT
awk -v comment="$comment" '$NF != comment' "$ak" > "$next"
printf 'restrict %s\n' "$pubkey" >> "$next"
chmod 600 "$next"
mv "$next" "$ak"
REMOTE

echo "CI deployment configured. Push to main to deploy https://triviando.gapc10.tech."
