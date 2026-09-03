#!/usr/bin/env bash
# Deploy QMC calculator + auth API to Imperial.
# Public API: Cloudflare DNS qmc-api.imperialnode.net → caddy-joinqmc → :4182
# Optional: Cloudflare Tunnel stack under ~/stacks/qmc-calc-tunnel (needs TUNNEL_TOKEN).
# Standalone — does NOT touch forscom-website / forscom-auth.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_DIR="${REMOTE_DIR:-/home/codyb/stacks/qmc-calc}"
TUNNEL_DIR="${TUNNEL_DIR:-/home/codyb/stacks/qmc-calc-tunnel}"
PUBLIC_API_HOST="${PUBLIC_API_HOST:-https://qmc-api.imperialnode.net}"

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

ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_DIR/server/data' '$REMOTE_DIR/deploy' '$TUNNEL_DIR' \"\$HOME/.config/systemd/user\""

rsync -az --delete \
  --exclude node_modules \
  --exclude server/node_modules \
  --exclude server/data \
  --exclude server/.env \
  --exclude .git \
  "$REPO_ROOT/" "$REMOTE_HOST:$REMOTE_DIR/"

rsync -az \
  "$REPO_ROOT/deploy/cloudflared/docker-compose.yml" \
  "$REMOTE_HOST:$TUNNEL_DIR/docker-compose.yml"

ssh "$REMOTE_HOST" env REMOTE_DIR="$REMOTE_DIR" TUNNEL_DIR="$TUNNEL_DIR" PUBLIC_API_HOST="$PUBLIC_API_HOST" bash -s <<'EOF'
set -euo pipefail
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
cd "$REMOTE_DIR/server"

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^STATIC_ROOT=.*|STATIC_ROOT=${REMOTE_DIR}|" .env
  sed -i "s|^DATA_DIR=.*|DATA_DIR=${REMOTE_DIR}/server/data|" .env
  if grep -q '^JWT_SECRET=$' .env; then
    sed -i "s|^JWT_SECRET=$|JWT_SECRET=$(openssl rand -hex 32)|" .env
  fi
  echo "Created ${REMOTE_DIR}/server/.env — add ROBLOX_CLIENT_ID and ROBLOX_CLIENT_SECRET"
fi

# Public Cloudflare hostname (GitHub Pages + Roblox redirect)
upsert_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    printf '%s=%s\n' "$key" "$val" >> .env
  fi
}
upsert_env SITE_URL "$PUBLIC_API_HOST"
upsert_env PUBLIC_API_URL "$PUBLIC_API_HOST"
upsert_env ROBLOX_REDIRECT_URI "${PUBLIC_API_HOST}/api/auth/callback"
upsert_env DEFAULT_RETURN_TO "https://codythebeast89.github.io/uniform-price-calculator/"
upsert_env ALLOWED_RETURN_ORIGINS "https://codythebeast89.github.io,https://qmc.isd,http://127.0.0.1:4182,http://localhost:4182"
upsert_env ALLOWED_RETURN_PREFIXES "https://codythebeast89.github.io/uniform-price-calculator/,http://127.0.0.1:4182/,http://localhost:4182/,https://qmc.isd/"
upsert_env LOGIN_FAIL_CLOSED_AGE "0"
upsert_env BIND_HOST "0.0.0.0"
upsert_env STATIC_ROOT "$REMOTE_DIR"
upsert_env DATA_DIR "${REMOTE_DIR}/server/data"
upsert_env TEMPLATE_API_BASE "http://127.0.0.1:8787"
# One-time migrate prior template API key env names, then drop them
if grep -q '^TEMPLATE_API_KEY=' .env 2>/dev/null && ! grep -q '^TEMPLATE_API_KEY=' .env 2>/dev/null; then
  KEY_VAL=$(grep -m1 '^TEMPLATE_API_KEY=' .env | cut -d= -f2-)
  upsert_env TEMPLATE_API_KEY "$KEY_VAL"
fi
sed -i '/^TEMPLATE_API_BASE=/d;/^TEMPLATE_API_KEY=/d' .env 2>/dev/null || true

npm install --omit=dev

sed "s|__REMOTE_DIR__|$REMOTE_DIR|g" "$REMOTE_DIR/deploy/qmc-calc.service" > "$HOME/.config/systemd/user/qmc-calc.service"
systemctl --user daemon-reload
systemctl --user enable --now qmc-calc.service
systemctl --user restart qmc-calc.service

# LAN Caddy (qmc.isd)
CADDY="/home/codyb/stacks/caddy/Caddyfile"
if [ -f "$CADDY" ] && ! grep -q '^qmc\.isd' "$CADDY"; then
  {
    echo ""
    echo "# QMC Uniform Price Calculator"
    cat "$REMOTE_DIR/deploy/caddy-qmc.isd.conf"
  } >> "$CADDY"
  docker exec caddy-proxy caddy reload --config /etc/caddy/Caddyfile || true
  echo "Appended qmc.isd to LAN Caddyfile"
fi

# Public Caddy (Cloudflare DNS → Imperial WAN)
JOINQMC_CADDY="/home/codyb/stacks/caddy-joinqmc/Caddyfile"
JOINQMC_COMPOSE="/home/codyb/stacks/caddy-joinqmc/docker-compose.yml"
if [ -f "$JOINQMC_CADDY" ]; then
  # Always sync the qmc-api site block from repo (api-only; never full static proxy).
  python3 - <<'PY'
from pathlib import Path
caddy = Path("/home/codyb/stacks/caddy-joinqmc/Caddyfile")
site = Path("/home/codyb/stacks/qmc-calc/deploy/caddy-qmc-api.imperialnode.net.conf").read_text().strip() + "\n"
text = caddy.read_text()
marker = "qmc-api.imperialnode.net"
if marker not in text:
    caddy.write_text(text.rstrip() + "\n\n# QMC Uniform Calculator API (public; not the Minecraft UI)\n" + site)
    print("Appended qmc-api.imperialnode.net to caddy-joinqmc")
else:
    # Replace existing site block (brace-matched) so container remount gets api-only config.
    start = text.find(marker)
    # rewind to line start
    start = text.rfind("\n", 0, start) + 1
    i = text.find("{", start)
    depth = 0
    end = None
    for idx in range(i, len(text)):
        if text[idx] == "{":
            depth += 1
        elif text[idx] == "}":
            depth -= 1
            if depth == 0:
                end = idx + 1
                break
    if end is None:
        raise SystemExit("failed to parse qmc-api site block")
    # drop a preceding comment line about QMC if present
    prefix = text[:start]
    if prefix.rstrip().endswith("Minecraft UI)"):
        prefix = prefix[: prefix.rfind("\n#")]
        if not prefix.endswith("\n"):
            prefix += "\n"
    new = prefix.rstrip() + "\n\n# QMC Uniform Calculator API (public; not the Minecraft UI)\n" + site + text[end:].lstrip("\n")
    if new != text:
        caddy.write_text(new if new.endswith("\n") else new + "\n")
        print("Updated qmc-api.imperialnode.net site block (api-only)")
    else:
        print("qmc-api site block already matches repo")
PY
  if [ -f "$JOINQMC_COMPOSE" ] && ! grep -q 'host.docker.internal:host-gateway' "$JOINQMC_COMPOSE"; then
    python3 - <<'PY'
from pathlib import Path
p = Path("/home/codyb/stacks/caddy-joinqmc/docker-compose.yml")
text = p.read_text()
needle = "    dns:\n      - 10.0.1.3\n      - 1.1.1.1\n"
insert = "    extra_hosts:\n      - \"host.docker.internal:host-gateway\"\n" + needle
if needle in text and "host.docker.internal:host-gateway" not in text:
    p.write_text(text.replace(needle, insert, 1))
    print("extra_hosts added to caddy-joinqmc compose")
PY
  fi
  # Docker → host API (mirrors FORSCOM staging :4181 rule)
  if command -v ufw >/dev/null && ! sudo ufw status | grep -q '4182/tcp'; then
    sudo ufw allow from 172.16.0.0/12 to any port 4182 proto tcp comment 'QMC calc API from Docker' || true
  fi
  # Force recreate so bind-mount picks up rewritten Caddyfile inode
  (cd /home/codyb/stacks/caddy-joinqmc && docker compose up -d --force-recreate)
  docker exec caddy-joinqmc caddy reload --config /etc/caddy/Caddyfile
  # Assert api-only: root must 404; health must 200
  sleep 1
  root_code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80/ 2>/dev/null || echo 000)"
  # Probe via Host header against joinqmc if listening on 443 inside docker network is hard;
  # fall back to checking container config contains respond 404
  if ! docker exec caddy-joinqmc grep -A20 '^qmc-api' /etc/caddy/Caddyfile | grep -q 'respond 404'; then
    echo "ERROR: caddy-joinqmc still missing api-only respond 404 for qmc-api" >&2
    docker exec caddy-joinqmc grep -A25 '^qmc-api' /etc/caddy/Caddyfile || true
    exit 1
  fi
  echo "caddy-joinqmc qmc-api site is api-only"
else
  echo "caddy-joinqmc Caddyfile missing"
fi

# Optional Cloudflare Tunnel (if token file exists)
if [ -f "$TUNNEL_DIR/.env" ] && grep -q '^TUNNEL_TOKEN=.\+' "$TUNNEL_DIR/.env"; then
  (cd "$TUNNEL_DIR" && docker compose up -d)
  echo "cloudflared tunnel started"
else
  echo "Tunnel not started (create $TUNNEL_DIR/.env with TUNNEL_TOKEN=… if you prefer Tunnel over public Caddy)"
fi

sleep 1
if ! curl -sf http://127.0.0.1:4182/health && ! curl -sf http://10.0.1.150:4182/health; then
  echo "ERROR: qmc-calc health check failed" >&2
  systemctl --user --no-pager --full status qmc-calc.service | head -40 || true
  exit 1
fi
echo
systemctl --user --no-pager --full status qmc-calc.service | head -20 || true
EOF

echo "==> Deploy finished."
echo "    Public API: $PUBLIC_API_HOST"
echo "    Health:     curl -s $PUBLIC_API_HOST/health"
echo "    1. Create a NEW Roblox OAuth app (not FORSCOM's)"
echo "    2. Redirect URI: $PUBLIC_API_HOST/api/auth/callback"
echo "    3. Put CLIENT_ID / SECRET in $REMOTE_DIR/server/.env on Imperial"
echo "    4. systemctl --user restart qmc-calc"
echo "    5. Copy api-config.example.json → api-config.json locally (gitignored); set API URLs/keys"
echo "    Docs: docs/cloudflare-tunnel-oauth.md"
