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
const SITE_URL = (process.env.SITE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const REDIRECT_URI = process.env.ROBLOX_REDIRECT_URI || `${SITE_URL}/api/auth/callback`;
const CLIENT_ID = process.env.ROBLOX_CLIENT_ID || "";
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const MIN_ACCOUNT_AGE_DAYS = Number(process.env.MIN_ACCOUNT_AGE_DAYS || 30);
const USAR_GID = Number(process.env.USAR_GROUP_ID || USAR_GROUP_ID);
const SECURE_COOKIES = process.env.SECURE_COOKIES !== "0";

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

function text(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

async function readSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[sessionCookieName()];
  if (!token) return null;
  try {
    return await verifySession(token);
  } catch {
    return null;
  }
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = join(STATIC_ROOT, pathname.replace(/^\/+/, ""));
  if (!filePath.startsWith(STATIC_ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return text(res, 404, "Not found");
  }
  const type = MIME[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(readFileSync(filePath));
}

async function handleAuthStart(req, res, url) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return text(res, 500, "Roblox OAuth is not configured on this server.");
  }
  const state = randomState();
  const returnTo = url.searchParams.get("returnTo") || "/";
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

async function handleAuthCallback(req, res, url) {
  const cookies = parseCookies(req.headers.cookie || "");
  const clearOauth = [
    clearCookie("oauth_state"),
    clearCookie("oauth_return"),
  ];
  const expected = cookies.oauth_state;
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const returnTo = cookies.oauth_return || "/";

  if (!expected || !state || state !== expected || !code) {
    return redirect(res, `/?auth_error=invalid_state`, clearOauth);
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
      return redirect(res, `/?auth_error=${authError}`, clearOauth);
    }

    const session = await signSession({
      userId: identity.userId,
      username: identity.username,
      displayName: identity.displayName,
      avatarUrl,
    });

    redirect(res, returnTo.startsWith("/") ? returnTo : "/", [
      ...clearOauth,
      setSessionCookie(session, SECURE_COOKIES),
    ]);
  } catch (err) {
    console.error("OAuth callback failed", err);
    redirect(res, `/?auth_error=server_error`, clearOauth);
  }
}

async function handleMe(req, res) {
  const session = await readSession(req);
  if (!session) return json(res, 401, { error: "unauthorized" });

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

  json(res, 200, {
    ...profile,
    awards,
    awardsStatus: getAwardsStatus(),
  });
}

async function handleLogout(_req, res) {
  redirect(res, "/", [clearSessionCookie()]);
}

async function handler(req, res) {
  const url = new URL(req.url || "/", SITE_URL);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      service: "qmc-calc-server",
      siteUrl: SITE_URL,
      oauthConfigured: Boolean(CLIENT_ID && CLIENT_SECRET),
      awards: getAwardsStatus(),
    });
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
    if (!session) return json(res, 401, { error: "unauthorized" });
    await syncAwards({ force: true });
    return json(res, 200, getAwardsStatus());
  }

  if (req.method === "GET") {
    return serveStatic(req, res, url);
  }

  text(res, 405, "Method not allowed");
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
}).listen(PORT, "127.0.0.1", () => {
  console.log(`qmc-calc-server listening on http://127.0.0.1:${PORT}`);
  console.log(`SITE_URL=${SITE_URL}`);
  console.log(`OAuth redirect URI: ${REDIRECT_URI}`);
  console.log(`Serving static from ${STATIC_ROOT}`);
});
