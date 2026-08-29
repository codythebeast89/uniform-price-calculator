import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAuthorizeUrl,
  exchangeCode,
  parseIdToken,
  fetchAvatarUrl,
  fetchUserGroups,
  fetchBirthdate,
  validateLoginRequirements,
} from "./roblox.mjs";
import {
  initSession,
  signSession,
  verifySession,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  clearCookie,
  randomState,
  sessionCookieName,
} from "./session.mjs";
import { buildProfile, USAR_GROUP_ID } from "./profile.mjs";
import { syncAwards, loadAwardsCache, getAwardsForUsername, getAwardsStatus, startAwardsRefresh } from "./awards.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(__dirname, "..");
const STATIC_ROOT = process.env.STATIC_ROOT || join(SERVER_ROOT, "..");
const DATA_DIR = process.env.DATA_DIR || join(SERVER_ROOT, "data");

const PORT = Number(process.env.PORT || 4182);
/** Bind address. Use 127.0.0.1 with cloudflared host-network, or 0.0.0.0 for LAN/Docker Caddy (do not DNAT :4182 to WAN). */
const BIND_HOST = process.env.BIND_HOST || "127.0.0.1";
/** Public API base (Cloudflare Tunnel hostname). Used as OAuth redirect base. */
const SITE_URL = (process.env.SITE_URL || process.env.PUBLIC_API_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const REDIRECT_URI = process.env.ROBLOX_REDIRECT_URI || `${SITE_URL}/api/auth/callback`;
const CLIENT_ID = process.env.ROBLOX_CLIENT_ID || "";
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const MIN_ACCOUNT_AGE_DAYS = Number(process.env.MIN_ACCOUNT_AGE_DAYS || 30);
const USAR_GID = Number(process.env.USAR_GROUP_ID || USAR_GROUP_ID);
const SECURE_COOKIES = process.env.SECURE_COOKIES !== "0";
const DEFAULT_RETURN_TO = (
  process.env.DEFAULT_RETURN_TO ||
  "https://codythebeast89.github.io/uniform-price-calculator/"
).replace(/\/?$/, "/");

const ALLOWED_RETURN_ORIGINS = (
  process.env.ALLOWED_RETURN_ORIGINS ||
  "https://codythebeast89.github.io,http://127.0.0.1:4182,http://localhost:4182,https://qmc.isd"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** state → { returnTo, exp } for OAuth (survives cross-site; cookie still set when same-site). */
const pendingOauth = new Map();
const OAUTH_TTL_MS = 10 * 60 * 1000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const allowed =
    ALLOWED_RETURN_ORIGINS.includes(origin) ||
    ALLOWED_RETURN_ORIGINS.some((o) => origin === o);
  if (!allowed) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

function redirect(res, location, setCookies = []) {
  const headers = { Location: location, "Cache-Control": "no-store" };
  if (setCookies.length) headers["Set-Cookie"] = setCookies;
  res.writeHead(302, headers);
  res.end();
}

function text(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders });
  res.end(body);
}

function sanitizeReturnTo(raw) {
  const fallback = DEFAULT_RETURN_TO;
  if (!raw) return fallback;
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return fallback;
    }
    const u = new URL(raw);
    const origin = u.origin;
    if (!ALLOWED_RETURN_ORIGINS.includes(origin)) return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

function pruneOauth() {
  const now = Date.now();
  for (const [k, v] of pendingOauth) {
    if (v.exp < now) pendingOauth.delete(k);
  }
}

async function readSession(req) {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    try {
      return await verifySession(auth.slice(7).trim());
    } catch {
      return null;
    }
  }
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[sessionCookieName()];
  if (!token) return null;
  try {
    return await verifySession(token);
  } catch {
    return null;
  }
}

function isBlockedStaticPath(pathname) {
  const p = pathname.replace(/^\/+/, "").toLowerCase();
  if (!p) return false;
  if (p.startsWith("server/") || p === "server") return true;
  if (p.startsWith("deploy/") || p.startsWith("docs/") || p.startsWith("scripts/")) return true;
  if (p.startsWith(".git/") || p === ".git") return true;
  if (/(^|\/)\.env(\.|$)/.test(p)) return true;
  if (p.endsWith(".mjs") || p.endsWith(".env") || p.endsWith(".example")) return true;
  return false;
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return text(res, 400, "Bad path");
  }
  if (pathname === "/") pathname = "/index.html";
  if (isBlockedStaticPath(pathname)) {
    return text(res, 404, "Not found");
  }
  const filePath = join(STATIC_ROOT, pathname.replace(/^\/+/, ""));
  if (!filePath.startsWith(STATIC_ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return text(res, 404, "Not found");
  }
  const type = MIME[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
  res.end(readFileSync(filePath));
}

async function handleAuthStart(req, res, url) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return text(res, 500, "Roblox OAuth is not configured on this server.");
  }
  pruneOauth();
  const state = randomState();
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo") || DEFAULT_RETURN_TO);
  pendingOauth.set(state, { returnTo, exp: Date.now() + OAUTH_TTL_MS });

  const authorizeUrl = buildAuthorizeUrl({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    state,
  });
  redirect(res, authorizeUrl, [
    `oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${SECURE_COOKIES ? "; Secure" : ""}`,
    `oauth_return=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${SECURE_COOKIES ? "; Secure" : ""}`,
  ]);
}

function appendTokenToReturn(returnTo, token, authError) {
  const u = new URL(returnTo);
  if (authError) {
    u.searchParams.set("auth_error", authError);
    u.hash = "";
    return u.toString();
  }
  // Hash so the token is not sent to GitHub as a referrer query string as often.
  u.hash = `qmc_token=${encodeURIComponent(token)}`;
  return u.toString();
}

async function handleAuthCallback(req, res, url) {
  const cookies = parseCookies(req.headers.cookie || "");
  const clearOauth = [clearCookie("oauth_state"), clearCookie("oauth_return")];
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  pruneOauth();
  const pending = state ? pendingOauth.get(state) : null;
  if (pending) pendingOauth.delete(state);

  const expectedCookie = cookies.oauth_state;
  const returnTo = sanitizeReturnTo(pending?.returnTo || cookies.oauth_return || DEFAULT_RETURN_TO);
  const stateOk = Boolean(pending) || Boolean(expectedCookie && state === expectedCookie);

  if (!state || !code || !stateOk) {
    return redirect(res, appendTokenToReturn(returnTo, "", "invalid_state"), clearOauth);
  }

  try {
    const tokens = await exchangeCode({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
      code,
    });
    const identity = parseIdToken(tokens.id_token);
    const [groups, birthdate, avatarUrl] = await Promise.all([
      fetchUserGroups(identity.userId),
      fetchBirthdate(tokens.access_token),
      fetchAvatarUrl(identity.userId),
    ]);

    const authError = validateLoginRequirements({
      accountCreatedAt: identity.accountCreatedAt,
      groups,
      usarGroupId: USAR_GID,
      minAccountAgeDays: MIN_ACCOUNT_AGE_DAYS,
      birthdate,
    });
    if (authError) {
      return redirect(res, appendTokenToReturn(returnTo, "", authError), clearOauth);
    }

    const session = await signSession({
      userId: identity.userId,
      username: identity.username,
      displayName: identity.displayName,
      avatarUrl,
    });

    // Cookie helps same-origin (qmc.isd); token hash helps GitHub Pages.
    redirect(res, appendTokenToReturn(returnTo, session), [
      ...clearOauth,
      setSessionCookie(session, SECURE_COOKIES),
    ]);
  } catch (err) {
    console.error("OAuth callback failed", err);
    redirect(res, appendTokenToReturn(returnTo, "", "server_error"), clearOauth);
  }
}

async function handleMe(req, res) {
  const session = await readSession(req);
  const headers = corsHeaders(req);
  if (!session) return json(res, 401, { error: "unauthorized" }, headers);

  let groups = [];
  try {
    groups = await fetchUserGroups(session.userId);
  } catch (err) {
    console.error("group fetch failed", err);
  }

  const profile = buildProfile({
    username: session.username,
    displayName: session.displayName,
    userId: session.userId,
    avatarUrl: session.avatarUrl || null,
    groups,
  });

  const usarRoleName = profile.usar?.roleName || null;
  const awards = getAwardsForUsername(session.username, { usarRoleName });

  json(
    res,
    200,
    {
      ...profile,
      awards,
      awardsStatus: getAwardsStatus(),
    },
    headers,
  );
}

async function handleLogout(req, res) {
  const headers = corsHeaders(req);
  const returnTo = sanitizeReturnTo(new URL(req.url || "/", SITE_URL).searchParams.get("returnTo") || DEFAULT_RETURN_TO);
  // Prefer redirect for simple <a href>; JSON for fetch callers.
  if ((req.headers.accept || "").includes("application/json") || req.headers.origin) {
    return json(res, 200, { ok: true }, { ...headers, "Set-Cookie": clearSessionCookie() });
  }
  redirect(res, returnTo, [clearSessionCookie()]);
}

async function handler(req, res) {
  const url = new URL(req.url || "/", SITE_URL);
  const headers = corsHeaders(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...headers, "Access-Control-Max-Age": "86400" });
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      service: "qmc-calc-server",
      siteUrl: SITE_URL,
      redirectUri: REDIRECT_URI,
      defaultReturnTo: DEFAULT_RETURN_TO,
      oauthConfigured: Boolean(CLIENT_ID && CLIENT_SECRET),
      awards: getAwardsStatus(),
    }, headers);
  }

  if (req.method === "GET" && url.pathname === "/api/auth/roblox") {
    return handleAuthStart(req, res, url);
  }
  if (req.method === "GET" && url.pathname === "/api/auth/callback") {
    return handleAuthCallback(req, res, url);
  }
  if (req.method === "GET" && url.pathname === "/api/auth/logout") {
    return handleLogout(req, res);
  }
  if (req.method === "GET" && url.pathname === "/api/me") {
    return handleMe(req, res);
  }
  if (req.method === "POST" && url.pathname === "/api/awards/sync") {
    const session = await readSession(req);
    if (!session) return json(res, 401, { error: "unauthorized" }, headers);
    await syncAwards({ force: true });
    return json(res, 200, getAwardsStatus(), headers);
  }

  if (req.method === "GET") {
    return serveStatic(req, res, url);
  }

  text(res, 405, "Method not allowed", headers);
}

function requireConfig() {
  initSession(JWT_SECRET || "dev-only-change-me-please");
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn("WARNING: ROBLOX_CLIENT_ID / ROBLOX_CLIENT_SECRET not set — login disabled until configured.");
  }
  if (!JWT_SECRET || JWT_SECRET.length < 16) {
    console.warn("WARNING: JWT_SECRET missing or short — using insecure default for boot.");
  }
}

requireConfig();
loadAwardsCache(DATA_DIR);
startAwardsRefresh();
syncAwards().catch((err) => console.error("Initial awards sync failed", err));

createServer((req, res) => {
  handler(req, res).catch((err) => {
    console.error(err);
    text(res, 500, "Server error");
  });
}).listen(PORT, BIND_HOST, () => {
  console.log(`qmc-calc-server listening on http://${BIND_HOST}:${PORT}`);
  console.log(`SITE_URL=${SITE_URL}`);
  console.log(`OAuth redirect URI: ${REDIRECT_URI}`);
  console.log(`Default return (GitHub Pages): ${DEFAULT_RETURN_TO}`);
  console.log(`Serving static from ${STATIC_ROOT}`);
});
