/**
 * Map Roblox group memberships → calculator unit path + USAR paygrade.
 * HQ role titles are returned as position labels when they are not company names.
 */

export const USAR_GROUP_ID = 3108077;

/** groupId → calculator UNIT_TREE path prefixes (command / division level). */
export const GROUP_PATH_HINTS = {
  3198375: ["Forces Command"],
  3725812: ["Forces Command", "1st Infantry Division"],
  6245987: ["Forces Command", "1st Cavalry Division"],
  3198387: ["Forces Command", "82nd Airborne Division"],
  3735974: ["Forces Command", "101st Airborne Division"],
  3114833: ["Army Special Operations Command"],
  3235972: ["Army Special Operations Command", "Army Special Forces"],
  5021791: ["Army Special Operations Command", "75th Ranger Regiment"],
  4929233: ["Military Police Corps"],
  33438975: ["Military Police Corps", "Criminal Investigations Division"],
  8124498: ["Military Police Corps", "503rd Battalion"],
  7076400: ["Military Police Corps", "14th Battalion"],
  15531002: ["Military Police Corps", "Judge Advocate General Corps"],
  4929259: ["Training and Doctrine Command"],
  34055702: ["Army Administrative Command"],
  14504795: ["Army Administrative Command", "Army Foreign Affairs"],
  5040124: ["Army Administrative Command", "Quartermaster Corps"],
  15727328: ["Army Administrative Command", "Community Staff"],
};

const HQ_ROLE_RE =
  /\b(commander|executive officer|command sergeant major|sergeant major|first sergeant|headquarters|hq|chief of staff|deputy|adjutant|operations|s-?\d)\b/i;

export function parseUsarPaygrade(roleName) {
  if (!roleName) return { paygrade: null, rankName: null, raw: roleName || "" };
  const match = roleName.match(/\[([EO]\d+[A-C]?)\]/i);
  if (!match) {
    return { paygrade: null, rankName: roleName.replace(/^\[[^\]]+\]\s*/, "").trim() || roleName, raw: roleName };
  }
  const paygrade = match[1].toUpperCase();
  const rankName = roleName.replace(match[0], "").replace(/^[\s\-–—]+/, "").trim();
  return { paygrade, rankName: rankName || null, raw: roleName };
}

export function isHeadquartersRole(roleName) {
  return HQ_ROLE_RE.test(roleName || "");
}

/**
 * Pick the most specific tracked unit path from the user's groups.
 * Returns { path: string[], positionLabel: string|null, groups: [...] }
 */
export function inferUnitPlacement(groups, trackedGroupIds = Object.keys(GROUP_PATH_HINTS).map(Number)) {
  const tracked = new Set(trackedGroupIds.map(Number));
  const memberships = (groups || [])
    .filter((g) => tracked.has(Number(g.groupId)))
    .map((g) => ({
      groupId: Number(g.groupId),
      groupName: g.groupName,
      roleName: g.roleName,
      rank: g.rank,
      path: GROUP_PATH_HINTS[Number(g.groupId)] || [g.groupName],
      isHq: isHeadquartersRole(g.roleName),
    }))
    .sort((a, b) => b.path.length - a.path.length || b.rank - a.rank);

  if (!memberships.length) {
    return { path: [], positionLabel: null, groups: [] };
  }

  const best = memberships[0];
  const positionLabel = best.isHq ? best.roleName : null;
  return {
    path: best.path,
    positionLabel,
    roleName: best.roleName,
    groupName: best.groupName,
    groups: memberships,
  };
}

export function buildProfile({ username, displayName, userId, avatarUrl, groups }) {
  const usar = (groups || []).find((g) => Number(g.groupId) === USAR_GROUP_ID);
  const { paygrade, rankName, raw } = parseUsarPaygrade(usar?.roleName);
  const unit = inferUnitPlacement(groups);

  return {
    userId,
    username,
    displayName,
    avatarUrl,
    usar: usar
      ? {
          roleName: raw,
          paygrade,
          rankName,
          rank: usar.rank,
        }
      : null,
    unit: {
      path: unit.path,
      pathLabel: unit.path.join(" / "),
      positionLabel: unit.positionLabel,
      roleName: unit.roleName || null,
      groupName: unit.groupName || null,
    },
    groups: (groups || []).map((g) => ({
      groupId: g.groupId,
      groupName: g.groupName,
      roleName: g.roleName,
      rank: g.rank,
    })),
  };
}
