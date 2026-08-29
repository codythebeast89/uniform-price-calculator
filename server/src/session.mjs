import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "qmc_calc_sess";
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

let secretKey;

export function initSession(secret) {
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET must be at least 16 characters");
  }
  secretKey = new TextEncoder().encode(secret);
}

export function sessionCookieName() {
  return COOKIE_NAME;
}

export async function signSession(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SEC}s`)
    .sign(secretKey);
}

export async function verifySession(token) {
  const { payload } = await jwtVerify(token, secretKey);
  return payload;
}

export function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    out[rawKey] = decodeURIComponent(rest.join("="));
  }
  return out;
}

export function buildCookie(name, value, { maxAge, httpOnly = true, secure = true, sameSite = "Lax", path = "/" } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  return parts.join("; ");
}

export function clearCookie(name) {
  return buildCookie(name, "", { maxAge: 0 });
}

export function setSessionCookie(token, secure = true) {
  return buildCookie(COOKIE_NAME, token, { maxAge: MAX_AGE_SEC, secure });
}

export function clearSessionCookie() {
  return clearCookie(COOKIE_NAME);
}

export function randomState() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}
