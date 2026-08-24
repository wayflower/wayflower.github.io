import assert from "node:assert/strict";
import test from "node:test";
import { publishPaper } from "../src/github.js";

test("publishing a paper writes the screenshot before updating papers.json", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const config = {
    github: {
      token: "test-token",
      owner: "wayflower",
      repo: "wayflower.github.io",
      branch: "main",
      apiVersion: "2026-03-10",
    },
  };

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === "PUT" && String(url).includes("assets/uploads/papers/")) {
      return new Response(JSON.stringify({ content: { sha: "image-sha" } }), { status: 201 });
    }
    if (!options.method && String(url).includes("assets/data/papers.json")) {
      return new Response(JSON.stringify({
        sha: "data-sha",
        content: Buffer.from("[]\n").toString("base64"),
      }), { status: 200 });
    }
    if (options.method === "PUT" && String(url).includes("assets/data/papers.json")) {
      return new Response(JSON.stringify({ content: { sha: "new-data-sha" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: "Unexpected request" }), { status: 500 });
  };

  try {
    const paper = await publishPaper(config, {
      title: "Example Paper",
      authors: "Jingtao Wei",
      url: "https://example.com/paper",
      image: { mimetype: "image/png", buffer: Buffer.from("image") },
    });

    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /assets\/uploads\/papers\//);
    assert.match(calls[1].url, /assets\/data\/papers\.json/);
    assert.match(calls[2].url, /assets\/data\/papers\.json/);

    const metadataRequest = JSON.parse(calls[2].options.body);
    const storedPapers = JSON.parse(Buffer.from(metadataRequest.content, "base64").toString("utf8"));
    assert.equal(metadataRequest.sha, "data-sha");
    assert.equal(storedPapers[0].title, "Example Paper");
    assert.equal(storedPapers[0].image, paper.image);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

