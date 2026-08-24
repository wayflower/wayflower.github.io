function required(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === "") {
    return fallback;
  }
  const number = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

function parseTrustProxy(value) {
  if (value === undefined || value === "") {
    return 1;
  }
  if (value.toLowerCase() === "false") {
    return false;
  }
  return parsePositiveInteger(value, 1, "TRUST_PROXY");
}

function validatedUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }

  const isLocalHttp = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error(`${name} must use HTTPS outside local development.`);
  }
  return url.href;
}

export function loadConfig(env = process.env) {
  const ownerGithubLogin = (env.OWNER_GITHUB_LOGIN?.trim() || "wayflower").toLowerCase();
  const tokenSecret = required(env, "TOKEN_SECRET");
  const frontendAuthReturnUrl = validatedUrl(
    required(env, "FRONTEND_AUTH_RETURN_URL"),
    "FRONTEND_AUTH_RETURN_URL"
  );
  const frontendShowcaseReturnUrl = validatedUrl(
    env.FRONTEND_SHOWCASE_RETURN_URL?.trim() || new URL("showcase.html", frontendAuthReturnUrl).href,
    "FRONTEND_SHOWCASE_RETURN_URL"
  );

  if (ownerGithubLogin !== "wayflower") {
    throw new Error("OWNER_GITHUB_LOGIN must remain bound to wayflower.");
  }
  if (tokenSecret.length < 32) {
    throw new Error("TOKEN_SECRET must contain at least 32 characters.");
  }

  const allowedOrigins = (env.ALLOWED_ORIGINS || "https://wayflower.github.io,http://127.0.0.1:8000,http://localhost:8000")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return Object.freeze({
    nodeEnv: env.NODE_ENV || "development",
    port: parsePositiveInteger(env.PORT, 8787, "PORT"),
    ownerGithubLogin,
    tokenSecret,
    githubOAuth: Object.freeze({
      clientId: required(env, "GITHUB_OAUTH_CLIENT_ID"),
      clientSecret: required(env, "GITHUB_OAUTH_CLIENT_SECRET"),
      callbackUrl: validatedUrl(required(env, "GITHUB_OAUTH_CALLBACK_URL"), "GITHUB_OAUTH_CALLBACK_URL"),
    }),
    frontendAuthReturnUrl,
    frontendShowcaseReturnUrl,
    github: Object.freeze({
      token: required(env, "GITHUB_TOKEN"),
      owner: env.GITHUB_OWNER?.trim() || "wayflower",
      repo: env.GITHUB_REPO?.trim() || "wayflower.github.io",
      branch: env.GITHUB_BRANCH?.trim() || "main",
      apiVersion: env.GITHUB_API_VERSION?.trim() || "2026-03-10",
    }),
    allowedOrigins: Object.freeze(allowedOrigins),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  });
}
