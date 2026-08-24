import { createHash, randomBytes } from "node:crypto";

function pkcePair() {
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function createGitHubOAuthClient(config) {
  return {
    createAuthorizationRequest(state) {
      const { codeVerifier, codeChallenge } = pkcePair();
      const url = new URL("https://github.com/login/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: config.githubOAuth.clientId,
        redirect_uri: config.githubOAuth.callbackUrl,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        login: config.ownerGithubLogin,
        allow_signup: "false",
        prompt: "select_account",
      }).toString();
      return { url: url.href, codeVerifier };
    },

    async exchangeCode(code, codeVerifier) {
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: config.githubOAuth.clientId,
          client_secret: config.githubOAuth.clientSecret,
          code,
          redirect_uri: config.githubOAuth.callbackUrl,
          code_verifier: codeVerifier,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token || data.error) {
        throw new Error(`GitHub OAuth token exchange failed: ${data.error || response.status}`);
      }
      if (String(data.scope || "").trim()) {
        throw new Error("GitHub OAuth returned unexpected scopes.");
      }
      return data.access_token;
    },

    async getAuthenticatedUser(accessToken) {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": config.github.apiVersion,
          "User-Agent": "wayflower-paper-api",
        },
      });
      const user = await response.json().catch(() => ({}));
      if (!response.ok || !user.login) {
        throw new Error(`Unable to read authenticated GitHub user: ${response.status}`);
      }
      return user;
    },
  };
}
