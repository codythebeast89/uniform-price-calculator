/**
 * Unit Awards tab: command/division → unit citation unlocks (not per-username).
 * Sheet tab name has a trailing space: "Unit Awards ".
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

/** Extra aliases so sheet unit labels match Roblox / UNIT_TREE paths. */
const UNIT_ALIASES = {
  "75th rangers regiment": "75th ranger regiment",
  "army special forces": "army special forces",
  delta: "delta force",
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
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (UNIT_ALIASES[s]) s = UNIT_ALIASES[s];
  return s;
}

export function catalogUnitAwardName(header) {
  const key = String(header || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return UNIT_AWARD_NAME_MAP[key] || null;
}

/**
 * Parse Unit Awards CSV rows → { "Army Presidential Unit Citation": ["Army Special Forces", …], … }
 * Headers on row index 1; award columns at indices 2,5,8,11,14 (C/F/I/L/O).
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
    const units = index[catalog] || (index[catalog] = []);
    for (let r = 2; r < rows.length; r++) {
      const unit = stripUnitAwardCell(rows[r]?.[c]);
      if (!unit) continue;
      if (!units.some((u) => normalizeUnitKey(u) === normalizeUnitKey(unit))) {
        units.push(unit);
      }
    }
  }
  return index;
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
    // Prefer longer overlap to avoid "1st" style false positives
    if (seg.length >= 5 && target.length >= 5 && (seg.includes(target) || target.includes(seg))) {
      return true;
    }
  }
  return false;
}

export function unitCitationsForPath(unitPath, unitAwardsIndex) {
  if (!unitPath?.length || !unitAwardsIndex) return [];
  const out = [];
  for (const [awardName, units] of Object.entries(unitAwardsIndex)) {
    if (units.some((u) => unitPathMatchesSheetUnit(unitPath, u))) {
      out.push({ category: "unit", name: awardName });
    }
  }
  return out;
}
