import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

describe("isAtLeast13 fail-open default", () => {
  let isAtLeast13;
  before(async () => {
    delete process.env.LOGIN_FAIL_CLOSED_AGE;
    ({ isAtLeast13 } = await import("../src/roblox.mjs"));
  });

  it("allows login when birthdate unavailable (default)", () => {
    assert.equal(isAtLeast13({ unavailable: true }), true);
    assert.equal(isAtLeast13(null), true);
  });

  it("rejects under-13 when birthdate present", () => {
    const now = new Date();
    assert.equal(
      isAtLeast13({
        birthYear: now.getUTCFullYear() - 10,
        birthMonth: 1,
        birthDay: 1,
      }),
      false,
    );
  });
});
