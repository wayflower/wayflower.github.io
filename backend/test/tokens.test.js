import assert from "node:assert/strict";
import test from "node:test";
import {
  createSignedToken,
  verifySignedToken,
} from "../src/tokens.js";

const secret = "test-secret-with-at-least-thirty-two-characters";

test("signed tokens preserve claims and reject tampering", () => {
  const now = Date.UTC(2026, 7, 23);
  const token = createSignedToken("paper-upload", { login: "wayflower" }, secret, 60, now);
  const decoded = verifySignedToken(token, "paper-upload", secret, now + 1000);
  assert.equal(decoded.login, "wayflower");
  assert.throws(() => verifySignedToken(`${token}x`, "paper-upload", secret, now + 1000));
});

test("signed tokens expire", () => {
  const now = Date.UTC(2026, 7, 23);
  const token = createSignedToken("paper-upload", {}, secret, 1, now);
  assert.throws(() => verifySignedToken(token, "paper-upload", secret, now + 1000));
});
