# QMC Calculator — Roblox OAuth on Imperial

Standalone auth for this calculator. **Not** the FORSCOM website OAuth app.

## Architecture

```
https://qmc.isd  (Caddy on Imperial)
   ├── static calculator UI  (served by qmc-calc-server)
   └── /api/*                (same Node process on 127.0.0.1:4182)
         ├── Roblox OAuth (dedicated app)
         ├── /api/me → username, USAR rank, unit path hint, awards
         └── QMC awards sheet sync
```

## 1. Create a new Roblox OAuth app

1. Open [Roblox Creator Dashboard → Credentials](https://create.roblox.com/dashboard/credentials)
2. Create an **OAuth 2.0** app (name e.g. `QMC Uniform Calculator`)
3. **Redirect URI** (exact):
   ```
   https://qmc.isd/api/auth/callback
   ```
4. Scopes: `openid`, `profile`
5. Copy **Client ID** and **Client Secret**

Do **not** reuse the FORSCOM website OAuth credentials.

## 2. DNS

Point `qmc.isd` at Imperial the same way other `*.isd` hostnames are (homelab DNS / Caddy).

## 3. Deploy

From this repo (when Imperial is reachable):

```bash
chmod +x scripts/deploy-imperial.sh
./scripts/deploy-imperial.sh
```

Then on Imperial:

```bash
sudo nano /opt/qmc-calc/server/.env
```

Set:

```env
ROBLOX_CLIENT_ID=...
ROBLOX_CLIENT_SECRET=...
JWT_SECRET=$(openssl rand -hex 32)
SITE_URL=https://qmc.isd
ROBLOX_REDIRECT_URI=https://qmc.isd/api/auth/callback
```

Restart:

```bash
sudo systemctl restart qmc-calc
curl -s http://127.0.0.1:4182/health
```

## 4. Verify

1. Open `https://qmc.isd`
2. Click **Log in with Roblox**
3. Complete OAuth — must be in USAR group `3108077`, account age ≥ 30 days
4. Calculator should fill Discord/Roblox username, paygrade, unit path hint, and lock awards to the QMC database entries for that username

## Login gate

Same membership rules as FORSCOM auth (independent implementation):

- Roblox account age ≥ 30 days
- Age 13+ (when Roblox returns birthdate)
- Member of USAR (`3108077`)

## Unit path notes

Command / Division are inferred from tracked Roblox groups. Brigade/company often is not a separate Roblox group — HQ roles return a **position label** (e.g. Company Commander) instead of a company name. Users can still finish the division dropdown manually.
