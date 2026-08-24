import express from "express";
import multer from "multer";
import { createSignedToken, generateNonce, verifySignedToken } from "./tokens.js";
import { publishPaper } from "./github.js";
import { SlidingWindowLimiter } from "./rate-limit.js";

const OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1000;
const EXCHANGE_CODE_LIFETIME_MS = 2 * 60 * 1000;
const UPLOAD_SESSION_SECONDS = 15 * 60;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_IMAGE_BYTES, fields: 8 },
});

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function normalizeText(value, maxLength) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : "";
}

function normalizePaperUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function setSecurityHeaders(_req, res, next) {
  res.set({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  next();
}

function createCorsMiddleware(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.get("Origin");
    if (origin && !allowed.has(origin.replace(/\/$/, ""))) {
      res.status(403).json({ error: "Origin is not allowed." });
      return;
    }
    if (origin) {
      res.set({
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        Vary: "Origin",
      });
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

function retryAfterResponse(res, result) {
  res.set("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
  res.status(429).json({ error: "Too many requests. Try again later." });
}

function bearerToken(req) {
  const header = req.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function frontendRedirect(config, destination, key, value) {
  const target = new URL(
    destination === "showcase" ? config.frontendShowcaseReturnUrl : config.frontendAuthReturnUrl
  );
  target.hash = new URLSearchParams({ [key]: value }).toString();
  return target.href;
}

function showcaseUploadUrl(config) {
  const repository = `${encodeURIComponent(config.github.owner)}/${encodeURIComponent(config.github.repo)}`;
  const branch = encodeURIComponent(config.github.branch);
  return `https://github.com/${repository}/upload/${branch}/assets/uploads/showcase`;
}

export function createApp({ config, oauthClient, paperPublisher = publishPaper }) {
  const app = express();
  const oauthStates = new Map();
  const exchangeCodes = new Map();
  const authStartLimiter = new SlidingWindowLimiter({ windowMs: 60 * 60 * 1000, limit: 20 });

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(setSecurityHeaders);
  app.use(createCorsMiddleware(config.allowedOrigins));
  app.use(express.json({ limit: "16kb", strict: true }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/auth/github/start", (req, res) => {
    const limitResult = authStartLimiter.consume(clientIp(req));
    if (!limitResult.allowed) {
      retryAfterResponse(res, limitResult);
      return;
    }

    const state = generateNonce();
    const destination = req.query.destination === "showcase" ? "showcase" : "papers";
    const authorization = oauthClient.createAuthorizationRequest(state);
    oauthStates.set(state, {
      codeVerifier: authorization.codeVerifier,
      destination,
      expiresAt: Date.now() + OAUTH_STATE_LIFETIME_MS,
    });
    res.redirect(302, authorization.url);
  });

  app.get("/auth/github/callback", async (req, res) => {
    const stateValue = String(req.query.state || "");
    const state = oauthStates.get(stateValue);
    oauthStates.delete(stateValue);

    if (req.query.error || !state || state.expiresAt <= Date.now()) {
      res.redirect(302, frontendRedirect(config, state?.destination, "github_error", "authentication_failed"));
      return;
    }

    try {
      const code = String(req.query.code || "");
      if (!code) {
        throw new Error("Missing GitHub authorization code.");
      }
      const accessToken = await oauthClient.exchangeCode(code, state.codeVerifier);
      const user = await oauthClient.getAuthenticatedUser(accessToken);
      if (String(user.login).toLowerCase() !== config.ownerGithubLogin) {
        res.redirect(302, frontendRedirect(config, state.destination, "github_error", "account_mismatch"));
        return;
      }

      if (state.destination === "showcase") {
        res.redirect(302, showcaseUploadUrl(config));
        return;
      }

      const exchangeCode = generateNonce();
      exchangeCodes.set(exchangeCode, {
        login: config.ownerGithubLogin,
        expiresAt: Date.now() + EXCHANGE_CODE_LIFETIME_MS,
      });
      res.redirect(302, frontendRedirect(config, state.destination, "github_code", exchangeCode));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "GitHub authentication failed");
      res.redirect(302, frontendRedirect(config, state.destination, "github_error", "authentication_failed"));
    }
  });

  app.post("/auth/github/session", (req, res) => {
    const code = String(req.body?.code || "");
    const exchange = exchangeCodes.get(code);
    exchangeCodes.delete(code);

    if (!exchange || exchange.expiresAt <= Date.now() || exchange.login !== config.ownerGithubLogin) {
      res.status(401).json({ error: "Invalid or expired GitHub login exchange code." });
      return;
    }

    const token = createSignedToken(
      "paper-upload",
      { login: config.ownerGithubLogin, nonce: generateNonce() },
      config.tokenSecret,
      UPLOAD_SESSION_SECONDS
    );
    res.json({ token, login: config.ownerGithubLogin, expiresIn: UPLOAD_SESSION_SECONDS });
  });

  app.post("/papers", upload.single("image"), async (req, res, next) => {
    try {
      const token = bearerToken(req);
      const session = verifySignedToken(token, "paper-upload", config.tokenSecret);
      if (session.login !== config.ownerGithubLogin) {
        res.status(403).json({ error: "Upload session does not match the repository owner." });
        return;
      }

      const title = normalizeText(req.body.title, 300);
      const authors = normalizeText(req.body.authors, 600);
      const url = normalizePaperUrl(req.body.url);
      const image = req.file;

      if (!title || !authors || !url || !image) {
        res.status(400).json({ error: "Title, authors, screenshot, and paper URL are required." });
        return;
      }
      if (!["image/png", "image/jpeg", "image/webp"].includes(image.mimetype)) {
        res.status(415).json({ error: "Screenshot must be PNG, JPEG, or WebP." });
        return;
      }

      const paper = await paperPublisher(config, { title, authors, url, image });
      res.status(201).json({ paper });
    } catch (error) {
      if (/token/i.test(error.message)) {
        res.status(401).json({ error: "Invalid or expired upload session." });
        return;
      }
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: "Invalid upload." });
      return;
    }
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid JSON body." });
      return;
    }
    console.error(error instanceof Error ? error.message : "Unknown server error");
    res.status(500).json({ error: "Internal server error." });
  });

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [state, data] of oauthStates) {
      if (data.expiresAt <= now) {
        oauthStates.delete(state);
      }
    }
    for (const [code, data] of exchangeCodes) {
      if (data.expiresAt <= now) {
        exchangeCodes.delete(code);
      }
    }
    authStartLimiter.prune(now);
  }, 5 * 60 * 1000);
  cleanup.unref();

  return app;
}
