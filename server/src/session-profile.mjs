/**
 * Build the authenticated profile payload shared by /api/me and Copy Template reports.
 */
export async function buildSessionProfile(session, deps) {
  const {
    fetchUserGroups,
    buildProfile,
    getAwardsForUsername,
    getAwardsStatus,
  } = deps;

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
  const awards = getAwardsForUsername(session.username, {
    usarRoleName,
    unitPath: profile.unit?.path || [],
  });

  return {
    ...profile,
    awards,
    awardsStatus: getAwardsStatus(),
  };
}

export function buildTemplateReportPayload(session, body, profile) {
  return {
    schema_version: 1,
    roblox_user_id: Number(session.userId),
    roblox_username: session.username,
    display_name: session.displayName,
    discord_name: body.discord_name || null,
    profile,
  };
}
