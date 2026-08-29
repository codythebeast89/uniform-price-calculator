const AUTH_URL = "https://apis.roblox.com/oauth/v1/authorize";
const TOKEN_URL = "https://apis.roblox.com/oauth/v1/token";

export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile",
    response_type: "code",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || "Token exchange failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

export function parseIdToken(idToken) {
  const [, payload] = idToken.split(".");
  if (!payload) throw new Error("Invalid id_token");
  const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return {
    userId: String(json.sub),
    username: json.preferred_username || json.nickname || json.name,
    displayName: json.name || json.preferred_username || json.nickname,
    accountCreatedAt: json.created_at ? new Date(json.created_at * 1000).toISOString() : null,
  };
}

export async function fetchAvatarUrl(userId) {
  const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.data?.[0];
  return item?.state === "Completed" ? item.imageUrl : null;
}

export async function fetchUserGroups(userId) {
  const res = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
  if (!res.ok) throw new Error("Failed to fetch Roblox groups");
  const data = await res.json();
  return (data.data || []).map((entry) => ({
    groupId: entry.group.id,
    groupName: entry.group.name,
    roleName: entry.role.name,
    rank: entry.role.rank,
  }));
}

export async function fetchBirthdate(accessToken) {
  try {
    const res = await fetch("https://users.roblox.com/v1/birthdate", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status >= 500) return { unavailable: true };
      return null;
    }
    return res.json();
  } catch {
    return { unavailable: true };
  }
}

export function isAtLeast13(birthdate) {
  if (!birthdate || birthdate.unavailable) {
    return process.env.LOGIN_FAIL_CLOSED_AGE !== "1";
  }
  if (!birthdate.birthYear || !birthdate.birthMonth || !birthdate.birthDay) return false;
  const born = new Date(Date.UTC(birthdate.birthYear, birthdate.birthMonth - 1, birthdate.birthDay));
  const today = new Date();
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < born.getUTCDate())) age -= 1;
  return age >= 13;
}

export function validateLoginRequirements({
  accountCreatedAt,
  groups,
  usarGroupId,
  minAccountAgeDays,
  birthdate,
}) {
  if (!accountCreatedAt) return "server_error";
  const created = new Date(accountCreatedAt);
  const ageDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < minAccountAgeDays) return "account_too_new";

  if (!isAtLeast13(birthdate)) return "under_age";

  const inUsar = groups.some((g) => Number(g.groupId) === Number(usarGroupId));
  if (!inUsar) return "not_in_usar";

  return null;
}
