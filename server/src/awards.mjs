/**
 * Awards sheet sync for the QMC uniform calculator.
 * Formatting + indexing logic ported from awards-tui / forscom-auth.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyAutoAwards } from "./auto-awards.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export const SHEET_ID = process.env.AWARDS_SHEET_ID || "1e_AqHIGrGdfNSgoHt6kLV89E6LADJmlZzhfRAUXo0wY";
const REFRESH_MS = Number(process.env.AWARDS_REFRESH_MINUTES || 15) * 60 * 1000;
const USER_AGENT = process.env.AWARDS_USER_AGENT || "qmc-calc-server/1.0 (awards sync)";

/** Public CSV layout. row_offset maps CSV index → live Google Sheets row. */
export const SHEET_META = {
  "Ribbons Database": { category: "ribbons", nameRow: 1, dataStartRow: 2, rowOffset: 8 },
  "Badges Database": { category: "badges", nameRow: 3, dataStartRow: 4, rowOffset: 6 },
  "Foreign Awards Database": { category: "foreign", nameRow: 2, dataStartRow: 3, rowOffset: 7 },
};

const SHEET_NAMES = Object.keys(SHEET_META);

const BADGE_ABBREV_SPECIAL = {
  ESB: "Expert Soldier Badge",
};

const INVISIBLE_CHARS = /[\u200b\u200c\u200d\ufeff]/g;
const CJS_RE = /\(?\s*(?:(\d+)\s*x|x\s*(\d+))\s*CJS\s*\)?/i;

let awardsByUser = new Map();
let lastSync = null;
let syncPromise = null;
let cacheFile = process.env.AWARDS_CACHE_PATH || null;

export function loadAwardColumns(path = join(ROOT, "award-columns.json")) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function colToIndex(col) {
  let n = 0;
  for (const ch of String(col).toUpperCase()) {
    if (ch < "A" || ch > "Z") continue;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return Math.max(0, n - 1);
}

export function csvIndexToSheetRow(sheet, csvIndex) {
  return csvIndex + 1 + (SHEET_META[sheet]?.rowOffset ?? 0);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === `"` && next === `"`) {
        field += `"`;
        i++;
      } else if (ch === `"`) inQuotes = false;
      else field += ch;
    } else if (ch === `"`) inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      /* skip */
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Strip zero-width characters and surrounding whitespace (awards-tui clean_cell). */
export function cleanCell(cell) {
  if (cell == null) return "";
  return String(cell).replace(INVISIBLE_CHARS, "").trim();
}

export function normalizeUsername(cell) {
  const text = cleanCell(cell);
  if (!text) return null;
  const match = text.match(/^@?([A-Za-z0-9_]+)/);
  return match ? match[1].toLowerCase() : null;
}

export function ordinalAward(n) {
  if (n === 2) return "2nd Award";
  if (n === 3) return "3rd Award";
  return `${n}th Award`;
}

export function formatRibbonAward(baseName, cell) {
  let name = baseName.trim();
  const device = cell.match(/-\s*"([^"]+)"/);
  if (device) name += ` ("${device[1]}")`;
  const count = cell.match(/\bx(\d+)\b/i);
  if (count) name += ` (${ordinalAward(Number(count[1]))})`;
  return name;
}

export function cjsPhrase(n) {
  if (n <= 1) return "Combat Jump Star";
  return `${n} Combat Jump Stars`;
}

/** Pull Combat Jump Star notation out so its count is not treated as an award ordinal. */
export function extractCjs(cell) {
  const match = cell.match(CJS_RE);
  if (!match) return { rest: cell, cjs: null };
  const n = Number(match[1] || match[2]);
  let rest = cell.replace(CJS_RE, "");
  rest = rest.replace(/\(\s*\)/g, "");
  rest = rest.replace(/\s*-\s*$/g, "");
  rest = rest.replace(/\s+/g, " ").trim();
  return { rest, cjs: cjsPhrase(n) };
}

export function attachCjs(name, cjs) {
  if (!cjs) return name;
  if (name.endsWith(")") && name.includes("(")) return `${name.slice(0, -1)}, ${cjs})`;
  return `${name} (${cjs})`;
}

/**
 * Expand short badge level codes relative to the column's award name.
 * MC means Master of the *current* badge (CIB → Master Combat Infantryman Badge).
 */
export function expandBadgeAbbrev(baseName, abbrev) {
  const base = baseName.trim();
  const key = abbrev.trim().toUpperCase();
  if (key === "MC") {
    if (base.toLowerCase().startsWith("master ")) return base;
    return `Master ${base}`;
  }
  if (BADGE_ABBREV_SPECIAL[key]) return BADGE_ABBREV_SPECIAL[key];
  return base;
}

export function formatBadgeAward(baseName, cell) {
  const base = baseName.trim();
  const { rest, cjs } = extractCjs(cell);
  const dash = rest.indexOf(" - ");
  if (dash === -1) return attachCjs(formatRibbonAward(base, rest), cjs);

  const detail = rest.slice(dash + 3).trim();
  if (!detail) return attachCjs(formatRibbonAward(base, rest), cjs);

  // Count may sit before or after the dash: "user x2 - MC" or "user - MC x2"
  const countMatch = rest.match(/\bx(\d+)\b/i);
  const count = countMatch ? Number(countMatch[1]) : null;
  let label = detail.replace(/\s*x\d+\b/gi, "").trim();
  label = label.replace(/\s+/g, " ").replace(/^[\s-]+|[\s-]+$/g, "");

  // Known short codes (MC, ESB), with or without an award count
  if ((label.toUpperCase() === "MC" || label.toUpperCase() === "ESB") && !detail.includes(",")) {
    let name = expandBadgeAbbrev(base, label);
    if (count != null) name += ` (${ordinalAward(count)})`;
    return attachCjs(name, cjs);
  }

  if (count != null && !detail.includes(",")) {
    let name = base;
    if (label && !name.toLowerCase().includes(label.toLowerCase())) {
      name = label.length <= 4 ? expandBadgeAbbrev(base, label) : `${name} (${label})`;
    }
    name += ` (${ordinalAward(count)})`;
    return attachCjs(name, cjs);
  }

  return attachCjs(`${base} (${detail})`, cjs);
}

export function formatAwardName(category, baseName, cell) {
  if (!baseName?.trim()) return null;
  if (category === "badges") return formatBadgeAward(baseName, cell);
  return formatRibbonAward(baseName, cell);
}

async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Sheet fetch failed (${sheetName}): ${res.status}`);
  return parseCsv(await res.text());
}

function addAward(map, username, award) {
  if (!username || !award?.name) return;
  const list = map.get(username) || [];
  if (award.sheet && award.col && award.row) {
    if (list.some((a) => a.sheet === award.sheet && a.col === award.col && a.row === award.row)) return;
  } else if (list.some((a) => a.category === award.category && a.name === award.name)) {
    return;
  }
  list.push(award);
  map.set(username, list);
}

/** Build user→awards index from already-fetched sheet rows (offline / tests). */
export function buildAwardsIndexFromRows(sheetRows, columns) {
  const map = new Map();
  for (const { col, sheet } of columns) {
    const meta = SHEET_META[sheet];
    const rows = sheetRows[sheet];
    if (!meta || !rows?.length) continue;

    const colIdx = colToIndex(col);
    const baseName = cleanCell(rows[meta.nameRow - 1]?.[colIdx]);
    if (!baseName) continue;

    for (let r = meta.dataStartRow - 1; r < rows.length; r++) {
      const cell = cleanCell(rows[r]?.[colIdx]);
      if (!cell) continue;
      const username = normalizeUsername(cell);
      const name = formatAwardName(meta.category, baseName, cell);
      if (!name) continue;
      addAward(map, username, {
        category: meta.category,
        name,
        sheet,
        col,
        row: csvIndexToSheetRow(sheet, r),
        cell,
        baseName,
      });
    }
  }
  return map;
}

export async function buildAwardsIndex(columns) {
  const fetched = await Promise.all(
    SHEET_NAMES.map(async (sheetName) => [sheetName, await fetchSheet(sheetName)]),
  );
  const sheetRows = Object.fromEntries(fetched);
  return buildAwardsIndexFromRows(sheetRows, columns);
}

function publicAward(award) {
  return { category: award.category, name: award.name };
}

export async function syncAwards({ force = false } = {}) {
  if (syncPromise && !force) return syncPromise;
  syncPromise = (async () => {
    const columns = loadAwardColumns();
    const map = await buildAwardsIndex(columns);
    awardsByUser = map;
    lastSync = new Date().toISOString();

    const cachePath = cacheFile || process.env.AWARDS_CACHE_PATH || join(ROOT, "data", "awards-cache.json");
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(
      cachePath,
      JSON.stringify({
        syncedAt: lastSync,
        userCount: map.size,
        awards: Object.fromEntries(map),
      }),
    );
    console.log(`Awards synced: ${map.size} users @ ${lastSync}`);
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

export function loadAwardsCache(dataDir) {
  const cachePath = process.env.AWARDS_CACHE_PATH || join(dataDir, "awards-cache.json");
  cacheFile = cachePath;
  if (!existsSync(cachePath)) return;
  try {
    const meta = JSON.parse(readFileSync(cachePath, "utf8"));
    lastSync = meta.syncedAt || null;
    if (meta.awards && typeof meta.awards === "object") {
      awardsByUser = new Map(
        Object.entries(meta.awards).map(([username, awards]) => [
          username.toLowerCase(),
          Array.isArray(awards) ? awards : [],
        ]),
      );
      console.log(`Awards cache loaded: ${awardsByUser.size} users @ ${lastSync || "unknown"}`);
    }
  } catch (err) {
    console.error("Failed to load awards cache:", err);
  }
}

export function getAwardsForUsername(username, context = {}) {
  if (!username) return [];
  const base = (awardsByUser.get(username.toLowerCase()) || []).map(publicAward);
  return applyAutoAwards(base, context);
}

export function getAwardsStatus() {
  return { lastSync, userCount: awardsByUser.size };
}

export function startAwardsRefresh() {
  syncAwards().catch((err) => console.error("Initial awards sync failed:", err));
  setInterval(() => {
    syncAwards().catch((err) => console.error("Awards refresh failed:", err));
  }, REFRESH_MS);
}
