import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";

function testConfig() {
  return {
    ownerGithubLogin: "wayflower",
    tokenSecret: "integration-test-secret-with-more-than-thirty-two-characters",
    trustProxy: 1,
    allowedOrigins: ["https://wayflower.github.io", "http://127.0.0.1:8000"],
    frontendAuthReturnUrl: "https://wayflower.github.io/papers.html",
    frontendShowcaseReturnUrl: "https://wayflower.github.io/showcase.html",
    github: {
      token: "unused",
      owner: "wayflower",
      repo: "wayflower.github.io",
      branch: "main",
      apiVersion: "2026-03-10",
    },
  };
}

function oauthMock(login = "wayflower") {
  let issuedState = "";
  return {
    get issuedState() {
      return issuedState;
    },
    createAuthorizationRequest(state) {
      issuedState = state;
      return {
        url: `https://github.com/login/oauth/authorize?state=${encodeURIComponent(state)}`,
        codeVerifier: "pkce-verifier",
      };
    },
    async exchangeCode(code, verifier) {
      assert.equal(code, "github-code");
      assert.equal(verifier, "pkce-verifier");
      return "oauth-access-token";
    },
    async getAuthenticatedUser(token) {
      assert.equal(token, "oauth-access-token");
      return { login };
    },
  };
}

test("the wayflower GitHub account unlocks a validated paper upload", async () => {
  let publishedInput;
  const oauthClient = oauthMock();
  const paperPublisher = async (_config, input) => {
    publishedInput = input;
    return {
      title: input.title,
      authors: input.authors,
      url: input.url,
      image: "assets/uploads/papers/test.png",
      createdAt: "2026-08-24T00:00:00.000Z",
    };
  };
  const app = createApp({ config: testConfig(), oauthClient, paperPublisher });

  await request(app)
    .get("/auth/github/start")
    .expect(302)
    .expect("Location", /github\.com\/login\/oauth\/authorize/);

  const callback = await request(app)
    .get("/auth/github/callback")
    .query({ state: oauthClient.issuedState, code: "github-code" })
    .expect(302);

  const redirect = new URL(callback.headers.location);
  const exchangeCode = new URLSearchParams(redirect.hash.slice(1)).get("github_code");
  assert.ok(exchangeCode);

  const session = await request(app)
    .post("/auth/github/session")
    .set("Origin", "https://wayflower.github.io")
    .send({ code: exchangeCode })
    .expect(200);

  assert.equal(session.body.login, "wayflower");
  assert.equal(typeof session.body.token, "string");
  assert.equal(session.headers["access-control-allow-origin"], "https://wayflower.github.io");

  await request(app)
    .post("/auth/github/session")
    .send({ code: exchangeCode })
    .expect(401);

  const publication = await request(app)
    .post("/papers")
    .set("Authorization", `Bearer ${session.body.token}`)
    .field("title", "  Example   Paper  ")
    .field("authors", "Jingtao Wei, Collaborator")
    .field("url", "https://example.com/paper")
    .attach("image", Buffer.from("test image"), { filename: "paper.png", contentType: "image/png" })
    .expect(201);

  assert.equal(publication.body.paper.title, "Example Paper");
  assert.equal(publishedInput.image.mimetype, "image/png");
});

test("a different GitHub account is rejected", async () => {
  const oauthClient = oauthMock("not-wayflower");
  const app = createApp({
    config: testConfig(),
    oauthClient,
    paperPublisher: async () => assert.fail("Publisher should not run."),
  });

  await request(app).get("/auth/github/start?destination=showcase").expect(302);
  const callback = await request(app)
    .get("/auth/github/callback")
    .query({ state: oauthClient.issuedState, code: "github-code" })
    .expect(302);

  const redirect = new URL(callback.headers.location);
  assert.equal(redirect.pathname, "/showcase.html");
  assert.equal(new URLSearchParams(redirect.hash.slice(1)).get("github_error"), "account_mismatch");
});

test("the wayflower account is sent to the GitHub showcase upload page", async () => {
  const oauthClient = oauthMock();
  const app = createApp({
    config: testConfig(),
    oauthClient,
    paperPublisher: async () => assert.fail("Publisher should not run."),
  });

  await request(app).get("/auth/github/start?destination=showcase").expect(302);
  await request(app)
    .get("/auth/github/callback")
    .query({ state: oauthClient.issuedState, code: "github-code" })
    .expect(302)
    .expect(
      "Location",
      "https://github.com/wayflower/wayflower.github.io/upload/main/assets/uploads/showcase"
    );
});

test("the API rejects untrusted origins and uploads without a session", async () => {
  const app = createApp({
    config: testConfig(),
    oauthClient: oauthMock(),
    paperPublisher: async () => assert.fail("Publisher should not run."),
  });

  await request(app)
    .post("/auth/github/session")
    .set("Origin", "https://attacker.example")
    .send({ code: "unused" })
    .expect(403);

  await request(app)
    .post("/papers")
    .field("title", "Example")
    .field("authors", "Jingtao Wei")
    .field("url", "https://example.com")
    .attach("image", Buffer.from("test image"), { filename: "paper.png", contentType: "image/png" })
    .expect(401);
});
