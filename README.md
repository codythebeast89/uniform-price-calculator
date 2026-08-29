# USAR Quartermaster Corps Uniform Price Calculator

Community-maintained fork of the [original calculator](https://github.com/ProEJ78/uniform-price-calculator) by ProEJ78.

**GitHub Pages (static):** https://codythebeast89.github.io/uniform-price-calculator/  
**Public API (Cloudflare → Imperial):** https://qmc-api.imperialnode.net — [docs/cloudflare-tunnel-oauth.md](docs/cloudflare-tunnel-oauth.md)  
**LAN:** https://qmc.isd — [docs/imperial-oauth-setup.md](docs/imperial-oauth-setup.md)

Calculate uniform order prices and generate copyable ordering templates for QMC.

Item lists follow the [QMC Uniform Guide](https://docs.google.com/document/d/1fc9gU7zDWnZu_3xoFPyP9NUH3D0jb9kDJG7SaAFitOM/edit), [Awards & Decorations](https://docs.google.com/document/d/1iTcTwtrTwjLhMUDras1Tq0NrxOIfmS4MADYSxnxG1Gg/edit), [Badge Information Trello](https://trello.com/b/o1GnoMon/quartermaster-corps-badge-information), and [QMC Database](https://docs.google.com/spreadsheets/d/1e_AqHIGrGdfNSgoHt6kLV89E6LADJmlZzhfRAUXo0wY/edit). Custom PT, Mess Dress, Greenouts (SRT), and tattoos are excluded.

## Roblox login (Imperial)

Standalone auth service under `server/` — **not** tied to the FORSCOM website OAuth app.

- Log in with Roblox → username, USAR paygrade/rank, unit path hint, and earned awards from the QMC sheet
- Logged-in users can only select awards they have on record
- Guests can still price manually without login

Deploy: `./scripts/deploy-imperial.sh` (requires Imperial SSH). Public login wiring: [docs/cloudflare-tunnel-oauth.md](docs/cloudflare-tunnel-oauth.md).

## Updating prices

Edit the `uniformData` object in `index.html`. Each uniform has a `basePrice`, plus optional `ribbons`, `badges`, `foreignRibbons`, `foreignBadges`, and `accessories` arrays with per-item `price` values.
