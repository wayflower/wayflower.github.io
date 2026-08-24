const showcaseUploadButton = document.querySelector("#showcase-github-upload");
const showcaseUploadStatus = document.querySelector("#showcase-upload-status");
const configuredOwnerApiBase = document.querySelector('meta[name="owner-api-base"]')?.content.trim().replace(/\/$/, "") || "";
const localOwnerApiBase = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://127.0.0.1:8787"
  : "";
const ownerApiBase = configuredOwnerApiBase || localOwnerApiBase;

let showcaseStatus = ownerApiBase ? "ready" : "unconfigured";

function showcaseText(zh, en) {
  return document.documentElement.dataset.language === "en" ? en : zh;
}

function renderShowcaseStatus() {
  const messages = {
    ready: ["仅账号 @wayflower 验证通过后可以上传。", "Upload is available only after verifying @wayflower."],
    unconfigured: ["GitHub 登录服务尚未配置。", "GitHub sign-in is not configured yet."],
    account_mismatch: ["当前 GitHub 账号不是 @wayflower，无法上传。", "The signed-in GitHub account is not @wayflower."],
    authentication_failed: ["GitHub 登录失败，请重试。", "GitHub sign-in failed. Please try again."],
  };
  const message = messages[showcaseStatus] || messages.authentication_failed;
  showcaseUploadStatus.textContent = showcaseText(...message);
  showcaseUploadStatus.dataset.state = showcaseStatus === "account_mismatch" || showcaseStatus === "authentication_failed"
    ? "error"
    : "";
}

if (ownerApiBase) {
  showcaseUploadButton.href = `${ownerApiBase}/auth/github/start?destination=showcase`;
  showcaseUploadButton.removeAttribute("aria-disabled");
}

showcaseUploadButton.addEventListener("click", (event) => {
  if (!ownerApiBase) {
    event.preventDefault();
    showcaseStatus = "unconfigured";
    renderShowcaseStatus();
  }
});

const authFragment = new URLSearchParams(window.location.hash.slice(1));
const githubError = authFragment.get("github_error");
if (githubError) {
  showcaseStatus = githubError === "account_mismatch" ? githubError : "authentication_failed";
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

document.addEventListener("wayflower:languagechange", renderShowcaseStatus);
renderShowcaseStatus();
