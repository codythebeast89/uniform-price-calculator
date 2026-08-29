# GitHub Pages + Cloudflare public API (Imperial)

Public UI stays on GitHub Pages. Login API is on Imperial, reached via Cloudflare DNS on **imperialnode.net** (not joinqmc Minecraft sites).

```
Browser → https://codythebeast89.github.io/uniform-price-calculator/
       → Log in → https://qmc-api.imperialnode.net/api/auth/roblox
       → Roblox
       → https://qmc-api.imperialnode.net/api/auth/callback
       → redirect to GitHub Pages with #qmc_token=...
       → Pages stores JWT, calls /api/me with Authorization: Bearer
```

## What is live

| Piece | Value |
|-------|--------|
| Public API | `https://qmc-api.imperialnode.net` |
| DNS | Cloudflare zone `imperialnode.net` → Imperial WAN `76.22.96.245` (DNS only) |
| TLS / proxy | `caddy-joinqmc` on Imperial → `10.0.1.150:4182` |
| Pages config | repo `api-config.json` → `apiBase` |

Optional **Cloudflare Tunnel** (`deploy/cloudflared/`) is supported if you prefer no WAN DNAT for HTTP — needs a Zero Trust tunnel token with *Cloudflare Tunnel Edit* permission. Public Caddy is the default path.

## Deploy

```bash
./scripts/deploy-imperial.sh
```

Sets `SITE_URL` / `ROBLOX_REDIRECT_URI` to `https://qmc-api.imperialnode.net`, binds the API on `0.0.0.0:4182` (not DNAT’d to WAN), and appends the Caddy site if missing.

## Roblox OAuth app (new app, not FORSCOM)

Redirect URI **exact**:

```
https://qmc-api.imperialnode.net/api/auth/callback
```

Scopes: `openid`, `profile`. Put client id/secret in `~/stacks/qmc-calc/server/.env` on Imperial, then:

```bash
systemctl --user restart qmc-calc
curl -s https://qmc-api.imperialnode.net/health
```

## GitHub Pages

`api-config.json` must be committed and pushed:

```json
{
  "apiBase": "https://qmc-api.imperialnode.net"
}
```

## Optional: Cloudflare Tunnel instead of public Caddy

1. Zero Trust → Networks → Tunnels → Create `qmc-calc`
2. Public hostname → service `http://127.0.0.1:4182`
3. On Imperial:

```bash
mkdir -p ~/stacks/qmc-calc-tunnel
# compose already synced by deploy
echo 'TUNNEL_TOKEN=eyJ...' > ~/stacks/qmc-calc-tunnel/.env
chmod 600 ~/stacks/qmc-calc-tunnel/.env
cd ~/stacks/qmc-calc-tunnel && docker compose up -d
```

4. Point DNS / `SITE_URL` / `api-config.json` at the tunnel hostname; set `BIND_HOST=127.0.0.1` if you only want host-network cloudflared.

## Why this works

- Roblox redirects the **browser** to the public Cloudflare hostname.
- After login, users land back on GitHub Pages with a token in the URL hash.
- joinqmc.net stays Minecraft-only; calculator UI stays on GitHub Pages.
