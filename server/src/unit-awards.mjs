/**
 * Unit Awards tab: command/division → unit citation unlocks (not per-username).
 * Sheet tab name has a trailing space: "Unit Awards ".
 * A unit listed multiple times under the same award → count (xN).
 */

export const UNIT_AWARDS_SHEET = "Unit Awards ";

/** Sheet header typos / short names → calculator catalog names. */
export const UNIT_AWARD_NAME_MAP = {
  "army presidental unit citation": "Army Presidential Unit Citation",
  "army presidential unit citation": "Army Presidential Unit Citation",
  "joint service meritorious unit": "Joint Service Meritorious Unit",
  "army valorous unit award": "Army Valorous Unit Award",
  "army meritorious unit commendation": "Army Meritorious Unit Commendation",
  "army superior unit award": "Army Superior Unit Award",
};

/** Canonical display labels for sheet spelling oversights. */
const CANONICAL_UNIT_LABEL = {
  "75 ranger regiment": "75th Ranger Regiment",
};

export function stripUnitAwardCell(cell) {
  let s = String(cell || "").trim();
  if (!s) return "";
  // "Delta Force | Army Valorous Unit Award" → unit only
  s = s.replace(/\s*\|.*$/, "").trim();
  // "1st Infantry Division (4/06/24)" → drop trailing date
  s = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return s;
}

export function normalizeUnitKey(name) {
  let s = String(name || "")
    .toLowerCase()
    .replace(/\brangers\b/g, "ranger")
    // "75th" / "75" / "1st" → same numeric unit key
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return s;
}

export function canonicalUnitLabel(unit) {
  const key = normalizeUnitKey(unit);
  return CANONICAL_UNIT_LABEL[key] || unit;
}

export function catalogUnitAwardName(header) {
  const key = String(header || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return UNIT_AWARD_NAME_MAP[key] || null;
}

/**
 * Parse Unit Awards CSV → { "Army Valorous Unit Award": [{ name, count }, …], … }
 * Duplicate / alias spellings (e.g. 75th Ranger vs 75th Rangers) count toward xN.
 */
export function parseUnitAwardsRows(rows) {
  const index = {};
  if (!rows?.length) return index;
  const headerRow = rows[1] || [];
  const colIdxs = [];
  for (let c = 0; c < headerRow.length; c++) {
    const catalog = catalogUnitAwardName(headerRow[c]);
    if (catalog) colIdxs.push({ c, catalog });
  }
  for (const { c, catalog } of colIdxs) {
    const byKey = new Map();
    for (let r = 2; r < rows.length; r++) {
      const unit = stripUnitAwardCell(rows[r]?.[c]);
      if (!unit) continue;
      const key = normalizeUnitKey(unit);
      if (!key) continue;
      const prev = byKey.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        byKey.set(key, { name: canonicalUnitLabel(unit), count: 1 });
      }
    }
    index[catalog] = [...byKey.values()];
  }
  return index;
}

function entryName(entry) {
  return typeof entry === "string" ? entry : entry?.name;
}

function entryCount(entry) {
  if (typeof entry === "string") return 1;
  return Math.max(1, Number(entry?.count) || 1);
}

/** True if any segment of the user's unit path matches a sheet unit label. */
export function unitPathMatchesSheetUnit(unitPath, sheetUnitName) {
  const target = normalizeUnitKey(sheetUnitName);
  if (!target || target.length < 3) return false;
  const segments = (unitPath || []).map(normalizeUnitKey).filter(Boolean);
  if (!segments.length) return false;
  const full = normalizeUnitKey(unitPath.join(" "));
  const candidates = [...segments, full];
  for (const seg of candidates) {
    if (seg === target) return true;
    if (seg.length >= 5 && target.length >= 5 && (seg.includes(target) || target.includes(seg))) {
      return true;
    }
  }
  return false;
}

export function formatUnitCitationName(awardName, count) {
  const n = Math.max(1, Number(count) || 1);
  return n >= 2 ? `${awardName} x${n}` : awardName;
}

export function unitCitationsForPath(unitPath, unitAwardsIndex) {
  if (!unitPath?.length || !unitAwardsIndex) return [];
  const out = [];
  for (const [awardName, units] of Object.entries(unitAwardsIndex)) {
    const hit = (units || []).find((u) => unitPathMatchesSheetUnit(unitPath, entryName(u)));
    if (!hit) continue;
    out.push({
      category: "unit",
      name: formatUnitCitationName(awardName, entryCount(hit)),
    });
  }
  return out;
}
