/**
 * Validate OAuth returnTo URLs so tokens are only sent to allowlisted destinations.
 * Public hosts require an exact path prefix (not bare origin).
 */
export function sanitizeReturnTo(raw, {
  fallback,
  allowedOrigins = [],
  allowedPrefixes = [],
} = {}) {
  if (!fallback) throw new Error("sanitizeReturnTo requires fallback");
  if (!raw) return fallback;
  try {
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return fallback;
    }
    const u = new URL(raw);
    if (!allowedOrigins.includes(u.origin)) return fallback;

    // Local / LAN hosts: any path on an allowlisted origin is fine.
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "qmc.isd") {
      return u.toString();
    }

    // Public hosts (e.g. github.io): require calculator path prefix, not bare origin.
    const path = u.pathname.replace(/\/index\.html$/, "/");
    const normalized = path.endsWith("/") ? path : `${path}/`;
    const ok = allowedPrefixes.some((p) => {
      const origin = typeof p === "string" ? null : p.origin;
      const prefixPath = typeof p === "string" ? p : p.path;
      if (origin && origin !== u.origin) return false;
      if (typeof p === "string") {
        try {
          const pu = new URL(p);
          if (pu.origin !== u.origin) return false;
          const base = pu.pathname.replace(/\/index\.html$/, "/").replace(/\/?$/, "/");
          return normalized === base || normalized.startsWith(base);
        } catch {
          return normalized.startsWith(prefixPath.replace(/\/?$/, "/"));
        }
      }
      return normalized === prefixPath || normalized.startsWith(prefixPath);
    });
    if (!ok) return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}
