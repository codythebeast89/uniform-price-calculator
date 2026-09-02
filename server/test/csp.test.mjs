import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const html = readFileSync(join(root, "index.html"), "utf8");

test("index.html ships a Content-Security-Policy meta tag", () => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src[^;]*qmc-api\.imperialnode\.net/);
  assert.match(html, /img-src[^;]*tr\.rbxcdn\.com/);
  assert.match(html, /frame-ancestors 'none'/);
  assert.doesNotMatch(html, /unsafe-eval/);
});
