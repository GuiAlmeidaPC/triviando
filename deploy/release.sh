#!/usr/bin/env bash
# Installs the artifacts built and tested by CI. Runs as the deploy user on
# the VPS; only the backend binary and frontend build are replaced.
set -euo pipefail

APP=/srv/triviando
src="${1:?usage: release.sh /srv/triviando/.incoming.XXXXXX}"

if [[ ! "$src" =~ ^/srv/triviando/\.incoming\.[A-Za-z0-9]+$ ]] ||
   [ ! -d "$src" ] || [ -L "$src" ]; then
	echo "refusing to deploy from '$src'" >&2
	exit 1
fi

for file in backend/bin/triviando frontend/dist/index.html; do
	if [ ! -s "$src/$file" ]; then
		echo "release is missing $file" >&2
		exit 1
	fi
done

# Guard releases even when launched outside GitHub Actions.
exec 9>"$APP/.deploy.lock"
flock -w 300 9

mkdir -p "$APP/backend/bin" "$APP/frontend/dist"
# Rename a new file over the executable so the running process can continue
# using its old inode until systemd restarts it.
install -m 755 "$src/backend/bin/triviando" "$APP/backend/bin/triviando.new"
mv -f "$APP/backend/bin/triviando.new" "$APP/backend/bin/triviando"
rsync -a --delete --delay-updates "$src/frontend/dist/" "$APP/frontend/dist/"

systemctl --user restart triviando
curl -fsS --max-time 5 --retry 10 --retry-delay 2 --retry-connrefused \
	http://127.0.0.1:8001/healthz
systemctl --user is-active --quiet triviando
printf '\nTriviando deployed successfully.\n'
