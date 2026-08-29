/** Auto-awarded ribbons not stored in the QMC sheet. */

const USAR_GROUP_ID = Number(process.env.USAR_GROUP_ID || 3108077);

/** CAB / CIB / CMB — deployment indicator badges (including Master variants from MC). */
const DEPLOYMENT_BADGE_PATTERNS = [
  /^combat action badge$/i,
  /^master combat action badge/i,
  /^combat infantryman badge$/i,
  /^master combat infantryman badge/i,
  /^combat medical badge$/i,
  /^master combat medical badge/i,
];

/** Shown when user has a deployment combat badge (CAB/CIB/CMB). */
export const DEPLOYMENT_AUTO_RIBBONS = [
  "Armed Forces Expeditionary Medal",
  "Global War on Terrorism Expeditionary Medal",
  "Army Overseas Service Ribbon",
];

/** Shown when user is E2+ in USAR (completed Basic Training). */
export const BASIC_TRAINING_AUTO_RIBBONS = [
  "National Defense Service Medal",
  "Global War on Terrorism Service Medal",
  "Army Service Ribbon",
];

export function parseUsarEnlistedGrade(roleName) {
  if (!roleName) return null;
  const bracket = roleName.match(/\[E(\d+)\]/i);
  if (bracket) return Number(bracket[1]);
  return null;
}

export function isUsarE2OrHigher(roleName) {
  const grade = parseUsarEnlistedGrade(roleName);
  return grade !== null && grade >= 2;
}

export function hasDeploymentCombatBadge(awards) {
  return awards.some(
    (a) =>
      a.category === "badges" &&
      DEPLOYMENT_BADGE_PATTERNS.some((pattern) => pattern.test(a.name.replace(/\s*\([^)]*\)\s*/g, " ").trim())),
  );
}

function ribbonNames(awards) {
  return new Set(awards.filter((a) => a.category === "ribbons").map((a) => a.name));
}

export function applyAutoAwards(awards, { usarRoleName } = {}) {
  const existing = ribbonNames(awards);
  const auto = [];

  if (hasDeploymentCombatBadge(awards)) {
    for (const name of DEPLOYMENT_AUTO_RIBBONS) {
      if (!existing.has(name)) auto.push({ category: "ribbons", name });
    }
  }

  if (isUsarE2OrHigher(usarRoleName)) {
    for (const name of BASIC_TRAINING_AUTO_RIBBONS) {
      if (!existing.has(name)) auto.push({ category: "ribbons", name });
    }
  }

  if (!auto.length) return awards;

  const ribbons = awards.filter((a) => a.category === "ribbons");
  const rest = awards.filter((a) => a.category !== "ribbons");
  return [...ribbons, ...auto, ...rest];
}

export { USAR_GROUP_ID };
