import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function signatureFor(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeStringEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSignedToken(kind, values, secret, lifetimeSeconds, now = Date.now()) {
  const payload = encodeJson({
    ...values,
    kind,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + lifetimeSeconds,
  });
  return `${payload}.${signatureFor(payload, secret)}`;
}

export function verifySignedToken(token, expectedKind, secret, now = Date.now()) {
  const [payload, providedSignature, extra] = String(token || "").split(".");
  if (!payload || !providedSignature || extra) {
    throw new Error("Malformed token.");
  }

  const expectedSignature = signatureFor(payload, secret);
  if (!safeStringEqual(providedSignature, expectedSignature)) {
    throw new Error("Invalid token signature.");
  }

  const decoded = decodeJson(payload);
  if (decoded.kind !== expectedKind) {
    throw new Error("Unexpected token kind.");
  }
  if (!Number.isSafeInteger(decoded.exp) || decoded.exp <= Math.floor(now / 1000)) {
    throw new Error("Token expired.");
  }
  return decoded;
}

export function generateNonce() {
  return randomBytes(18).toString("base64url");
}
