import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubOAuthClient } from "../src/github-oauth.js";

function config() {
  return {
    ownerGithubLogin: "wayflower",
    githubOAuth: {
      clientId: "client-id",
      clientSecret: "client-secret",
      callbackUrl: "https://paper-api.example.com/auth/github/callback",
    },
    github: { apiVersion: "2026-03-10" },
  };
}

test("GitHub authorization uses state and PKCE without requesting repository scope", () => {
  const client = createGitHubOAuthClient(config());
  const authorization = client.createAuthorizationRequest("random-state");
  const url = new URL(authorization.url);

  assert.equal(url.origin, "https://github.com");
  assert.equal(url.searchParams.get("state"), "random-state");
  assert.equal(url.searchParams.get("login"), "wayflower");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(url.searchParams.has("scope"), false);
  assert.ok(authorization.codeVerifier.length >= 43);
});

test("GitHub OAuth exchanges the code and reads the authenticated account", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("login/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "oauth-token", scope: "" }), { status: 200 });
    }
    if (String(url) === "https://api.github.com/user") {
      return new Response(JSON.stringify({ login: "wayflower" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
  };

  try {
    const client = createGitHubOAuthClient(config());
    const token = await client.exchangeCode("temporary-code", "pkce-verifier");
    const user = await client.getAuthenticatedUser(token);

    assert.equal(token, "oauth-token");
    assert.equal(user.login, "wayflower");
    assert.match(String(requests[0].options.body), /code_verifier=pkce-verifier/);
    assert.equal(requests[1].options.headers.Authorization, "Bearer oauth-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
