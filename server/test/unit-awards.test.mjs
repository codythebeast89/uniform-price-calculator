import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseUnitAwardsRows,
  unitCitationsForPath,
  unitPathMatchesSheetUnit,
  catalogUnitAwardName,
  stripUnitAwardCell,
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

  it("parses Unit Awards rows into citation→units", () => {
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
      ],
      ["", "", "Army Special Forces (03/21/21)", "", "", "1st Infantry Division (4/06/24)", "", "", "75th Ranger Regiment (09/02/2023)"],
      ["", "", "", "", "", "", "", "", "75th Rangers Regiment (12/17/2023)"],
    ];
    const index = parseUnitAwardsRows(rows);
    assert.deepEqual(index["Army Presidential Unit Citation"], ["Army Special Forces"]);
    assert.deepEqual(index["Joint Service Meritorious Unit"], ["1st Infantry Division"]);
    assert.equal(index["Army Valorous Unit Award"].length, 1); // rangers alias dedupe
    assert.equal(index["Army Valorous Unit Award"][0], "75th Ranger Regiment");

    const asf = unitCitationsForPath(
      ["Army Special Operations Command", "Army Special Forces"],
      index,
    ).map((a) => a.name);
    assert.ok(asf.includes("Army Presidential Unit Citation"));
    assert.ok(!asf.includes("Joint Service Meritorious Unit"));

    const id = unitCitationsForPath(["Forces Command", "1st Infantry Division"], index).map(
      (a) => a.name,
    );
    assert.ok(id.includes("Joint Service Meritorious Unit"));
  });
});
