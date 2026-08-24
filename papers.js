const paperList = document.querySelector("#paper-list");
const paperDialog = document.querySelector("#paper-upload-dialog");
const openPaperUpload = document.querySelector("#open-paper-upload");
const closePaperUpload = document.querySelector("#close-paper-upload");
const githubAuthPanel = document.querySelector("#github-auth-panel");
const githubSignIn = document.querySelector("#github-sign-in");
const paperEntryForm = document.querySelector("#paper-entry-form");
const paperFormStatus = document.querySelector("#paper-form-status");
const configuredPaperApi = document.querySelector('meta[name="owner-api-base"]')?.content.trim().replace(/\/$/, "") || "";
const paperApiBase = configuredPaperApi || (
  ["127.0.0.1", "localhost"].includes(window.location.hostname)
    ? "http://127.0.0.1:8787"
    : ""
);

let papers = [];
let paperSessionToken = "";

function paperLanguage() {
  return document.documentElement.dataset.language === "en" ? "en" : "zh";
}

function paperText(zh, en) {
  return paperLanguage() === "en" ? en : zh;
}

function safeWebUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderPaperList() {
  paperList.innerHTML = "";

  if (!papers.length) {
    const empty = document.createElement("p");
    empty.className = "paper-empty";
    empty.textContent = paperText("目前暂无论文成果。", "No publications yet.");
    paperList.append(empty);
    paperList.setAttribute("aria-busy", "false");
    return;
  }

  papers.forEach((paper) => {
    const paperUrl = safeWebUrl(paper.url);
    const imageUrl = safeWebUrl(paper.image);
    if (!paper.title || !paper.authors || !paperUrl || !imageUrl) {
      return;
    }

    const article = document.createElement("article");
    article.className = "paper-card";

    const imageLink = document.createElement("a");
    imageLink.className = "paper-card-image";
    imageLink.href = paperUrl;
    imageLink.target = "_blank";
    imageLink.rel = "noreferrer";

    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = paper.title;
    image.loading = "lazy";
    imageLink.append(image);

    const content = document.createElement("div");
    content.className = "paper-card-content";

    const label = document.createElement("p");
    label.className = "paper-card-label";
    label.textContent = paper.venue || "PUBLICATION";

    const title = document.createElement("h3");
    const titleLink = document.createElement("a");
    titleLink.href = paperUrl;
    titleLink.target = "_blank";
    titleLink.rel = "noreferrer";
    titleLink.textContent = paper.title;
    title.append(titleLink);

    const authors = document.createElement("p");
    authors.className = "paper-card-authors";
    authors.textContent = paper.authors;

    const link = document.createElement("a");
    link.className = "inline-arrow paper-card-link";
    link.href = paperUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.innerHTML = `<span>${paperText("查看论文", "Open paper")}</span><i data-lucide="arrow-up-right" aria-hidden="true"></i>`;

    content.append(label, title, authors, link);
    article.append(imageLink, content);
    paperList.append(article);
  });

  if (!paperList.children.length) {
    papers = [];
    renderPaperList();
    return;
  }

  paperList.setAttribute("aria-busy", "false");
  refreshIcons();
}

async function loadPapers() {
  try {
    const response = await fetch(`assets/data/papers.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Paper data responded with ${response.status}`);
    }
    const data = await response.json();
    papers = Array.isArray(data) ? data : [];
    renderPaperList();
  } catch (error) {
    console.warn("Unable to load papers:", error);
    paperList.innerHTML = "";
    const message = document.createElement("p");
    message.className = "paper-empty";
    message.textContent = paperText("暂时无法读取论文列表。", "The publication list is temporarily unavailable.");
    paperList.append(message);
    paperList.setAttribute("aria-busy", "false");
  }
}

function setPaperStatus(zh, en, state = "") {
  paperFormStatus.textContent = paperText(zh, en);
  paperFormStatus.dataset.state = state;
}

function setPaperFormBusy(form, isBusy) {
  form.querySelectorAll("button, input, textarea").forEach((control) => {
    control.disabled = isBusy;
  });
}

function resetPaperDialog() {
  paperEntryForm.reset();
  githubAuthPanel.hidden = Boolean(paperSessionToken);
  paperEntryForm.hidden = !paperSessionToken;
  setPaperFormBusy(paperEntryForm, false);
  githubSignIn.disabled = !paperApiBase;
  setPaperStatus(
    paperApiBase ? "" : "GitHub 登录服务尚未配置。",
    paperApiBase ? "" : "GitHub sign-in is not configured yet.",
    paperApiBase ? "" : "notice"
  );
}

openPaperUpload.addEventListener("click", () => {
  resetPaperDialog();
  paperDialog.showModal();
  refreshIcons();
});

closePaperUpload.addEventListener("click", () => paperDialog.close());

paperDialog.addEventListener("click", (event) => {
  if (event.target === paperDialog) {
    paperDialog.close();
  }
});

githubSignIn.addEventListener("click", () => {
  if (!paperApiBase) {
    setPaperStatus("GitHub 登录服务尚未配置。", "GitHub sign-in is not configured yet.", "error");
    return;
  }
  window.location.assign(`${paperApiBase}/auth/github/start`);
});

async function completeGitHubLogin() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const exchangeCode = fragment.get("github_code");
  const authError = fragment.get("github_error");
  if (!exchangeCode && !authError) {
    return;
  }

  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  resetPaperDialog();
  paperDialog.showModal();

  if (authError) {
    const mismatch = authError === "account_mismatch";
    setPaperStatus(
      mismatch ? "当前 GitHub 账号不是 @wayflower。" : "GitHub 登录失败，请重试。",
      mismatch ? "The signed-in GitHub account is not @wayflower." : "GitHub sign-in failed. Please try again.",
      "error"
    );
    return;
  }

  if (!paperApiBase) {
    setPaperStatus("GitHub 登录服务尚未配置。", "GitHub sign-in is not configured yet.", "error");
    return;
  }

  githubSignIn.disabled = true;
  setPaperStatus("正在核验 GitHub 账号…", "Verifying GitHub account…");

  try {
    const response = await fetch(`${paperApiBase}/auth/github/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: exchangeCode }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token || String(data.login).toLowerCase() !== "wayflower") {
      throw new Error(`GitHub session exchange responded with ${response.status}`);
    }
    paperSessionToken = data.token;
    resetPaperDialog();
    setPaperStatus("GitHub 账号 @wayflower 已验证。", "GitHub account @wayflower verified.", "success");
    paperEntryForm.querySelector("input")?.focus();
  } catch (error) {
    console.warn("Unable to complete GitHub sign-in:", error);
    setPaperStatus("GitHub 登录已失效，请重新登录。", "GitHub sign-in expired. Please sign in again.", "error");
  } finally {
    githubSignIn.disabled = !paperApiBase;
    refreshIcons();
  }
}

paperEntryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!paperSessionToken) {
    setPaperStatus("请先完成身份验证。", "Verify your identity first.", "error");
    return;
  }

  const formData = new FormData(paperEntryForm);
  const image = formData.get("image");
  if (!(image instanceof File) || !image.type.startsWith("image/")) {
    setPaperStatus("请选择论文截图。", "Select a paper screenshot.", "error");
    return;
  }
  if (image.size > 5 * 1024 * 1024) {
    setPaperStatus("截图不能超过 5 MB。", "The screenshot must be 5 MB or smaller.", "error");
    return;
  }

  setPaperFormBusy(paperEntryForm, true);
  setPaperStatus("正在提交论文…", "Publishing paper…");

  try {
    const response = await fetch(`${paperApiBase}/papers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${paperSessionToken}` },
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      paperSessionToken = "";
      resetPaperDialog();
      setPaperStatus("GitHub 登录已失效，请重新登录。", "GitHub sign-in expired. Please sign in again.", "error");
      return;
    }
    if (!response.ok || !data.paper) {
      throw new Error(`Paper submission responded with ${response.status}`);
    }
    const immediateImage = `https://raw.githubusercontent.com/wayflower/wayflower.github.io/main/${data.paper.image}`;
    papers = [{ ...data.paper, image: immediateImage }, ...papers];
    renderPaperList();
    setPaperStatus("论文已提交，页面将在部署完成后正式更新。", "Paper submitted. The page will update after deployment.", "success");
    paperEntryForm.reset();
  } catch (error) {
    console.warn("Unable to submit paper:", error);
    setPaperStatus("提交失败，请稍后重试。", "Unable to publish the paper. Please try again later.", "error");
  } finally {
    setPaperFormBusy(paperEntryForm, false);
  }
});

document.addEventListener("wayflower:languagechange", () => {
  renderPaperList();
  if (paperDialog.open && !paperApiBase) {
    setPaperStatus("GitHub 登录服务尚未配置。", "GitHub sign-in is not configured yet.", "notice");
  }
});

loadPapers();
completeGitHubLogin();
