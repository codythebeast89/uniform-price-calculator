import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeReturnTo } from "../src/sanitize-return.mjs";

const FALLBACK = "https://codythebeast89.github.io/uniform-price-calculator/";
const ORIGINS = [
  "https://codythebeast89.github.io",
  "http://127.0.0.1:4182",
  "http://localhost:4182",
  "https://qmc.isd",
];
const PREFIXES = [
  { origin: "https://codythebeast89.github.io", path: "/uniform-price-calculator/" },
];

function sanitize(raw) {
  return sanitizeReturnTo(raw, {
    fallback: FALLBACK,
    allowedOrigins: ORIGINS,
    allowedPrefixes: PREFIXES,
  });
}

describe("sanitizeReturnTo", () => {
  it("returns fallback for empty / relative / bad URLs", () => {
    assert.equal(sanitize(""), FALLBACK);
    assert.equal(sanitize("/evil"), FALLBACK);
    assert.equal(sanitize("//evil.example/"), FALLBACK);
    assert.equal(sanitize("not a url"), FALLBACK);
  });

  it("allows the calculator path on github.io", () => {
    assert.equal(
      sanitize("https://codythebeast89.github.io/uniform-price-calculator/"),
      "https://codythebeast89.github.io/uniform-price-calculator/",
    );
    assert.equal(
      sanitize("https://codythebeast89.github.io/uniform-price-calculator/index.html"),
      "https://codythebeast89.github.io/uniform-price-calculator/index.html",
    );
  });

  it("rejects other github.io repos (token phishing)", () => {
    assert.equal(
      sanitize("https://codythebeast89.github.io/evil-pages/"),
      FALLBACK,
    );
    assert.equal(
      sanitize("https://codythebeast89.github.io/"),
      FALLBACK,
    );
  });

  it("allows any path on local / LAN origins", () => {
    assert.equal(
      sanitize("http://127.0.0.1:4182/any/path"),
      "http://127.0.0.1:4182/any/path",
    );
    assert.equal(sanitize("https://qmc.isd/foo"), "https://qmc.isd/foo");
  });

  it("rejects foreign origins", () => {
    assert.equal(sanitize("https://evil.example/steal"), FALLBACK);
  });
});
