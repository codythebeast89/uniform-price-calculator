import test from "node:test";
import assert from "node:assert/strict";
import { buildTemplateReportPayload } from "../src/session-profile.mjs";

test("buildTemplateReportPayload uses server profile, not client body", () => {
  const session = {
    userId: "40485973",
    username: "codythebeast89",
    displayName: "codythebeast89",
  };
  const serverProfile = {
    userId: "40485973",
    username: "codythebeast89",
    usar: { roleName: "[E3] Private First Class" },
  };
  const body = {
    discord_name: "111",
    discord_proof: "222",
    profile: { userId: "999", username: "spoofed" },
  };
  const payload = buildTemplateReportPayload(session, body, serverProfile);
  assert.equal(payload.roblox_user_id, 40485973);
  assert.equal(payload.profile.username, "codythebeast89");
  assert.notEqual(payload.profile.userId, "999");
  assert.equal(payload.discord_name, "111");
  assert.equal(payload.discord_proof, undefined);
});
