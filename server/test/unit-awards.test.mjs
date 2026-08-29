import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseUnitAwardsRows,
  unitCitationsForPath,
  unitPathMatchesSheetUnit,
  catalogUnitAwardName,
  stripUnitAwardCell,
  normalizeUnitKey,
  formatUnitCitationName,
} from "../src/unit-awards.mjs";

describe("unit-awards", () => {
  it("maps sheet headers including Presidental typo", () => {
    assert.equal(
      catalogUnitAwardName("Army Presidental Unit Citation"),
      "Army Presidential Unit Citation",
    );
    assert.equal(catalogUnitAwardName("Army Superior Unit Award"), "Army Superior Unit Award");
  });

  it("strips dates and pipe suffixes", () => {
    assert.equal(stripUnitAwardCell("1st Infantry Division (4/06/24)"), "1st Infantry Division");
    assert.equal(stripUnitAwardCell("Delta Force | Army Valorous Unit Award"), "Delta Force");
  });

  it("treats 75th Ranger / 75th Rangers / 75 Ranger as the same unit", () => {
    assert.equal(normalizeUnitKey("75th Ranger Regiment"), normalizeUnitKey("75th Rangers Regiment"));
    assert.equal(normalizeUnitKey("75th Ranger Regiment"), normalizeUnitKey("75 Ranger Regiment"));
  });

  it("matches path segments to sheet units", () => {
    assert.equal(
      unitPathMatchesSheetUnit(["Military Police Corps", "14th Battalion"], "Military Police Corps"),
      true,
    );
    assert.equal(
      unitPathMatchesSheetUnit(
        ["Army Special Operations Command", "Army Special Forces"],
        "Army Special Forces",
      ),
      true,
    );
    assert.equal(
      unitPathMatchesSheetUnit(["Forces Command", "1st Infantry Division"], "75th Ranger Regiment"),
      false,
    );
  });

  it("counts duplicate unit listings as xN (including Ranger spelling variants)", () => {
    const rows = [
      ["", "", "Unit Awards"],
      [
        "",
        "",
        "Army Presidental Unit Citation",
        "",
        "",
        "Joint Service Meritorious Unit",
        "",
        "",
        "Army Valorous Unit Award",
        "",
        "",
        "Army Meritorious Unit Commendation",
      ],
      [
        "",
        "",
        "Army Special Forces (03/21/21)",
        "",
        "",
        "1st Infantry Division (4/06/24)",
        "",
        "",
        "75th Ranger Regiment (09/02/2023)",
        "",
        "",
        "1st Infantry Division (2/27/23)",
      ],
      ["", "", "", "", "", "", "", "", "75th Rangers Regiment (12/17/2023)", "", "", "1st Infantry Division (7/27/24)"],
      ["", "", "", "", "", "", "", "", "Delta Force | Army Valorous Unit Award"],
    ];
    const index = parseUnitAwardsRows(rows);
    assert.deepEqual(index["Army Presidential Unit Citation"], [
      { name: "Army Special Forces", count: 1 },
    ]);
    const valorous = index["Army Valorous Unit Award"];
    const rangers = valorous.find((u) => normalizeUnitKey(u.name) === "75 ranger regiment");
    assert.equal(rangers.count, 2);
    assert.equal(rangers.name, "75th Ranger Regiment");
    assert.equal(valorous.find((u) => u.name === "Delta Force").count, 1);

    const muc = index["Army Meritorious Unit Commendation"].find(
      (u) => normalizeUnitKey(u.name) === "1 infantry division",
    );
    assert.equal(muc.count, 2);

    const rangerAwards = unitCitationsForPath(
      ["Army Special Operations Command", "75th Ranger Regiment"],
      index,
    ).map((a) => a.name);
    assert.ok(rangerAwards.includes("Army Valorous Unit Award x2"));
    assert.equal(formatUnitCitationName("Army Valorous Unit Award", 1), "Army Valorous Unit Award");
    assert.equal(formatUnitCitationName("Army Valorous Unit Award", 2), "Army Valorous Unit Award x2");
  });
});
