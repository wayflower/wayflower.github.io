const DATA_PATH = "assets/data/papers.json";
const IMAGE_DIRECTORY = "assets/uploads/papers";

function apiHeaders(config) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${config.github.token}`,
    "X-GitHub-Api-Version": config.github.apiVersion,
    "User-Agent": "wayflower-paper-api",
  };
}

async function githubRequest(config, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      ...apiHeaders(config),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(`GitHub request failed with ${response.status}: ${body.message || "Unknown error"}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function encodeContent(content) {
  return Buffer.isBuffer(content)
    ? content.toString("base64")
    : Buffer.from(content, "utf8").toString("base64");
}

async function putContent(config, path, content, message, sha) {
  return githubRequest(
    config,
    `/repos/${config.github.owner}/${config.github.repo}/contents/${path}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: encodeContent(content),
        branch: config.github.branch,
        ...(sha ? { sha } : {}),
      }),
    }
  );
}

async function readPapers(config) {
  try {
    const data = await githubRequest(
      config,
      `/repos/${config.github.owner}/${config.github.repo}/contents/${DATA_PATH}?ref=${encodeURIComponent(config.github.branch)}`
    );
    const papers = JSON.parse(Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8"));
    return { papers: Array.isArray(papers) ? papers : [], sha: data.sha };
  } catch (error) {
    if (error.status === 404) {
      return { papers: [], sha: undefined };
    }
    throw error;
  }
}

function slugify(value) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return ascii.slice(0, 64) || "paper";
}

function imageExtension(mimeType) {
  const extensions = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  return extensions[mimeType];
}

export async function publishPaper(config, input) {
  const extension = imageExtension(input.image.mimetype);
  if (!extension) {
    throw new Error("Unsupported screenshot type.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const imagePath = `${IMAGE_DIRECTORY}/${timestamp}-${slugify(input.title)}.${extension}`;

  await putContent(
    config,
    imagePath,
    input.image.buffer,
    `Add screenshot for ${input.title}`
  );

  const paper = {
    title: input.title,
    authors: input.authors,
    image: imagePath,
    url: input.url,
    createdAt: new Date().toISOString(),
  };

  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const current = await readPapers(config);
      const papers = [paper, ...current.papers];
      await putContent(
        config,
        DATA_PATH,
        `${JSON.stringify(papers, null, 2)}\n`,
        `Publish paper: ${input.title}`,
        current.sha
      );
      return paper;
    } catch (error) {
      lastError = error;
      if (![409, 422].includes(error.status)) {
        throw error;
      }
    }
  }

  throw lastError;
}

