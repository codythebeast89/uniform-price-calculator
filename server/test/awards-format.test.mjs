import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBadgeAward,
  formatRibbonAward,
  cellHasMasterCode,
  ordinalAward,
  expandBadgeAbbrev,
} from "../src/awards.mjs";

describe("awards formatting", () => {
  it("maps MC on combat badges to Master variants", () => {
    assert.equal(cellHasMasterCode("player - MC"), true);
    assert.equal(cellHasMasterCode("player MC"), true);
    assert.equal(
      expandBadgeAbbrev("Combat Infantryman Badge", "MC"),
      "Master Combat Infantryman Badge",
    );
    assert.equal(
      formatBadgeAward("Combat Infantryman Badge", "player - MC"),
      "Master Combat Infantryman Badge",
    );
    assert.equal(
      formatBadgeAward("Combat Action Badge", "player x2"),
      "Combat Action Badge (2nd Award)",
    );
  });

  it("formats ribbon devices", () => {
    const out = formatRibbonAward("Army Commendation Medal", 'V - "C"');
    assert.match(out, /Army Commendation Medal/);
    assert.match(out, /\("C"\)/);
  });

  it("ordinal helpers (sheet uses 2nd/3rd; 1st is omitted)", () => {
    assert.equal(ordinalAward(2), "2nd Award");
    assert.equal(ordinalAward(3), "3rd Award");
    assert.equal(ordinalAward(4), "4th Award");
  });
});
