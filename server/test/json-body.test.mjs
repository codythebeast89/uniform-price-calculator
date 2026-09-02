import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readJsonBody } from "../src/json-body.mjs";

function mockReq(chunks) {
  const req = new EventEmitter();
  queueMicrotask(() => {
    for (const chunk of chunks) req.emit("data", chunk);
    req.emit("end");
  });
  req.destroy = () => {};
  return req;
}

test("readJsonBody parses JSON under limit", async () => {
  const body = await readJsonBody(mockReq([Buffer.from('{"a":1}')]));
  assert.deepEqual(body, { a: 1 });
});

test("readJsonBody rejects oversized payload", async () => {
  await assert.rejects(
    () => readJsonBody(mockReq([Buffer.alloc(20_000)]), 16_384),
    (err) => err.code === "PAYLOAD_TOO_LARGE",
  );
});
