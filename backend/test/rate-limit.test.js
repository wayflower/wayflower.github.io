import assert from "node:assert/strict";
import test from "node:test";
import { SlidingWindowLimiter } from "../src/rate-limit.js";

test("sliding window limiter rejects requests beyond the limit", () => {
  const limiter = new SlidingWindowLimiter({ windowMs: 1000, limit: 2 });
  assert.equal(limiter.consume("owner", 1000).allowed, true);
  assert.equal(limiter.consume("owner", 1100).allowed, true);
  assert.equal(limiter.consume("owner", 1200).allowed, false);
  assert.equal(limiter.consume("owner", 2101).allowed, true);
});

