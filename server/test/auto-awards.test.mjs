import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyAutoAwards,
  completedBasicTraining,
  isUsarE2OrHigher,
  hasDeploymentCombatBadge,
} from "../src/auto-awards.mjs";

describe("auto-awards", () => {
  it("parses enlisted grades with letter suffixes", () => {
    assert.equal(completedBasicTraining("[E4A] Specialist"), true);
    assert.equal(completedBasicTraining("[E9B] Command Sergeant Major"), true);
    assert.equal(completedBasicTraining("[E1] Private"), false);
  });

  it("adds BT ribbons for officers", () => {
    const out = applyAutoAwards([], { usarRoleName: "[O3] Captain" });
    const names = out.map((a) => a.name);
    assert.ok(names.includes("National Defense Service Medal"));
    assert.ok(names.includes("Army Service Ribbon"));
  });

  it("adds deployment ribbons when CAB present", () => {
    const awards = [{ category: "badges", name: "Combat Action Badge" }];
    assert.equal(hasDeploymentCombatBadge(awards), true);
    const out = applyAutoAwards(awards, { usarRoleName: "[E4] Specialist" });
    const names = out.map((a) => a.name);
    assert.ok(names.includes("Armed Forces Expeditionary Medal"));
  });
});
