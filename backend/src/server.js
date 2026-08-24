import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createGitHubOAuthClient } from "./github-oauth.js";

const config = loadConfig();
const oauthClient = createGitHubOAuthClient(config);
const app = createApp({ config, oauthClient });

const server = app.listen(config.port, () => {
  console.log(`Wayflower paper API listening on port ${config.port}.`);
});

server.on("error", (error) => {
  console.error(error instanceof Error ? error.message : "Server failed to start");
  process.exitCode = 1;
});

async function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

