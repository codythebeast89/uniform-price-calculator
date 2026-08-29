#!/usr/bin/env bash
# Deploy QMC calculator + auth API to Imperial (Caddy reverse proxy on qmc.isd).
# Does NOT touch forscom-website / forscom-auth.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_DIR="${REMOTE_DIR:-/opt/qmc-calc}"
SERVICE_NAME="qmc-calc"
CADDY_SNIPPET="$REPO_ROOT/deploy/caddy-qmc.isd.conf"

resolve_host() {
  if [ -n "${REMOTE_HOST:-}" ]; then
    echo "$REMOTE_HOST"
    return 0
  fi
  if ssh -o ConnectTimeout=5 -o BatchMode=yes imperialserver "true" 2>/dev/null; then
    echo "imperialserver"
    return 0
  fi
  if ssh -o ConnectTimeout=10 -o BatchMode=yes imperialserver-ts "true" 2>/dev/null; then
    echo "imperialserver-ts"
    return 0
  fi
  echo "ERROR: Cannot reach imperialserver (LAN) or imperialserver-ts (Tailscale)" >&2
  return 1
}

REMOTE_HOST="$(resolve_host)"
echo "==> Deploying to $REMOTE_HOST:$REMOTE_DIR"

ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_DIR/server/data' '$REMOTE_DIR/deploy'"

rsync -az --delete \
  --exclude node_modules \
  --exclude server/data \
  --exclude server/.env \
  --exclude .git \
  "$REPO_ROOT/" "$REMOTE_HOST:$REMOTE_DIR/"

ssh "$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
cd '$REMOTE_DIR/server'
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created $REMOTE_DIR/server/.env — fill ROBLOX_CLIENT_ID / SECRET / JWT_SECRET"
fi
npm install --omit=dev

sudo cp '$REMOTE_DIR/deploy/qmc-calc.service' /etc/systemd/system/qmc-calc.service
sudo systemctl daemon-reload
sudo systemctl enable --now qmc-calc.service
sudo systemctl restart qmc-calc.service

# Patch Caddyfile if qmc.isd block missing
CADDY="/home/codyb/stacks/caddy/Caddyfile"
if [ -f "\$CADDY" ] && ! grep -q 'qmc.isd' "\$CADDY"; then
  echo "" >> "\$CADDY"
  cat '$REMOTE_DIR/deploy/caddy-qmc.isd.conf' >> "\$CADDY"
  docker exec caddy-proxy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \\
    || docker exec caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \\
    || true
  echo "Appended qmc.isd to Caddyfile and attempted reload"
else
  echo "Caddy qmc.isd block already present (or Caddyfile not found at \$CADDY)"
fi

sleep 1
curl -sf http://127.0.0.1:4182/health | head -c 400 || true
echo
EOF

echo "==> Done. Open https://qmc.isd after DNS/TLS and OAuth secrets are set."
echo "    Roblox redirect URI must be exactly: https://qmc.isd/api/auth/callback"
