# QMC Calculator — Roblox OAuth on Imperial

Standalone auth for this calculator. **Not** the FORSCOM website OAuth app.

Install path on Imperial: `~/stacks/qmc-calc` (user systemd unit `qmc-calc.service`).

**Public (GitHub Pages login):** https://qmc-api.imperialnode.net — see [cloudflare-tunnel-oauth.md](./cloudflare-tunnel-oauth.md)  
**LAN:** https://qmc.isd

## 1. Create a new Roblox OAuth app

1. Open [Roblox Creator Dashboard → Credentials](https://create.roblox.com/dashboard/credentials)
2. Create an **OAuth 2.0** app (name e.g. `QMC Uniform Calculator`)
3. **Redirect URI** (exact):
   ```
   https://qmc-api.imperialnode.net/api/auth/callback
   ```
4. Scopes: `openid`, `profile`
5. Copy **Client ID** and **Client Secret**

Do **not** reuse the FORSCOM website OAuth credentials.

## 2. Deploy

```bash
chmod +x scripts/deploy-imperial.sh
./scripts/deploy-imperial.sh
```

Then on Imperial:

```bash
nano ~/stacks/qmc-calc/server/.env
```

Set `ROBLOX_CLIENT_ID` / `ROBLOX_CLIENT_SECRET`, then:

```bash
systemctl --user restart qmc-calc
curl -s https://qmc-api.imperialnode.net/health
```

## 3. Verify

1. Open https://codythebeast89.github.io/uniform-price-calculator/ (after pushing `api-config.json`)
2. Click **Log in with Roblox**
3. Complete OAuth — must be in USAR group `3108077`, account age ≥ 30 days
4. Calculator should fill username, paygrade, unit path hint, and lock awards to the QMC database

## Login gate

- Roblox account age ≥ 30 days
- Age 13+ (when Roblox returns birthdate)
- Member of USAR (`3108077`)

## Unit path notes

Command / Division are inferred from tracked Roblox groups. Brigade/company often is not a separate Roblox group — HQ roles return a **position label** instead of a company name. Users can still finish the division dropdown manually.
