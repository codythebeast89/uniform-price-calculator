#!/usr/bin/env bash
# Deploy QMC calculator + auth API to Imperial (Caddy on qmc.isd).
# Standalone — does NOT touch forscom-website / forscom-auth.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_DIR="${REMOTE_DIR:-/home/codyb/stacks/qmc-calc}"

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

ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_DIR/server/data' '$REMOTE_DIR/deploy' \"\$HOME/.config/systemd/user\""

rsync -az --delete \
  --exclude node_modules \
  --exclude server/node_modules \
  --exclude server/data \
  --exclude server/.env \
  --exclude .git \
  "$REPO_ROOT/" "$REMOTE_HOST:$REMOTE_DIR/"

ssh "$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
export XDG_RUNTIME_DIR="\${XDG_RUNTIME_DIR:-/run/user/\$(id -u)}"
cd '$REMOTE_DIR/server'

if [ ! -f .env ]; then
  cp .env.example .env
  # Point paths at the stacks install
  sed -i 's|^STATIC_ROOT=.*|STATIC_ROOT=$REMOTE_DIR|' .env
  sed -i 's|^DATA_DIR=.*|DATA_DIR=$REMOTE_DIR/server/data|' .env
  # Generate a JWT secret if empty
  if grep -q '^JWT_SECRET=\$" .env || grep -q '^JWT_SECRET=\$' .env || grep -q '^JWT_SECRET=$' .env; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=\$(openssl rand -hex 32)|" .env
  fi
  echo "Created $REMOTE_DIR/server/.env — add ROBLOX_CLIENT_ID and ROBLOX_CLIENT_SECRET"
fi

npm install --omit=dev

cp '$REMOTE_DIR/deploy/qmc-calc.service' "\$HOME/.config/systemd/user/qmc-calc.service"
systemctl --user daemon-reload
systemctl --user enable --now qmc-calc.service
systemctl --user restart qmc-calc.service

CADDY="/home/codyb/stacks/caddy/Caddyfile"
if [ -f "\$CADDY" ] && ! grep -q '^qmc\.isd' "\$CADDY"; then
  {
    echo ""
    echo "# QMC Uniform Price Calculator"
    cat '$REMOTE_DIR/deploy/caddy-qmc.isd.conf'
  } >> "\$CADDY"
  docker exec caddy-proxy caddy reload --config /etc/caddy/Caddyfile \\
    || docker exec caddy-joinqmc caddy reload --config /etc/caddy/Caddyfile \\
    || true
  echo "Appended qmc.isd to Caddyfile"
else
  echo "Caddy qmc.isd already present (or Caddyfile missing)"
fi

sleep 1
curl -sf http://127.0.0.1:4182/health || true
echo
systemctl --user --no-pager --full status qmc-calc.service | head -20 || true
EOF

echo "==> Deploy finished."
echo "    1. Create a NEW Roblox OAuth app (not FORSCOM's)"
echo "    2. Redirect URI: https://qmc.isd/api/auth/callback"
echo "    3. Put CLIENT_ID / SECRET in $REMOTE_DIR/server/.env on Imperial"
echo "    4. systemctl --user restart qmc-calc"
echo "    5. Open https://qmc.isd"
