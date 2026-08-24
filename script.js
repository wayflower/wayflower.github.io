const root = document.documentElement;
const themeToggle = document.querySelector("#theme-toggle");
const languageToggle = document.querySelector("#language-toggle");
const menuToggle = document.querySelector("#menu-toggle");
const mobileNav = document.querySelector("#mobile-nav");
const projectList = document.querySelector("#project-list");
const uploadLists = document.querySelectorAll("[data-upload-list]");

const savedTheme = localStorage.getItem("wayflower-theme");
const savedLanguage = localStorage.getItem("wayflower-language");
const requestedLanguage = new URLSearchParams(window.location.search).get("lang");
const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

let loadedRepos = [];
const uploadedFiles = new Map();

function currentLanguage() {
  return root.dataset.language === "en" ? "en" : "zh";
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function updatePageTitle(language) {
  const page = window.location.pathname.split("/").pop() || "index.html";
  const titles = {
    "index.html": { zh: "魏靖弢 — 个人主页", en: "Jingtao Wei — Personal Homepage" },
    "cv.html": { zh: "个人简历 — 魏靖弢", en: "CV — Jingtao Wei" },
    "papers.html": { zh: "论文 — 魏靖弢", en: "Papers — Jingtao Wei" },
    "showcase.html": { zh: "个人展示 — 魏靖弢", en: "More — Jingtao Wei" },
  };

  if (titles[page]) {
    document.title = titles[page][language];
  }
}

function updateThemeButton() {
  const isDark = root.dataset.theme === "dark";
  const isEnglish = currentLanguage() === "en";
  const label = isEnglish
    ? isDark ? "Switch to light mode" : "Switch to dark mode"
    : isDark ? "切换浅色模式" : "切换深色模式";

  themeToggle.setAttribute("aria-label", label);
  themeToggle.setAttribute("title", label);
  themeToggle.innerHTML = `<i data-lucide="${isDark ? "sun" : "moon"}" aria-hidden="true"></i>`;
}

function updateMenuButton(isOpen = false) {
  const isEnglish = currentLanguage() === "en";
  const label = isEnglish
    ? isOpen ? "Close navigation" : "Open navigation"
    : isOpen ? "关闭导航" : "打开导航";

  menuToggle.setAttribute("aria-label", label);
  menuToggle.setAttribute("title", label);
  menuToggle.innerHTML = `<i data-lucide="${isOpen ? "x" : "menu"}" aria-hidden="true"></i>`;
}

function setTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem("wayflower-theme", theme);
  updateThemeButton();
  refreshIcons();
}

function setLanguage(language) {
  const normalized = language === "en" ? "en" : "zh";
  const isEnglish = normalized === "en";

  root.dataset.language = normalized;
  root.lang = isEnglish ? "en" : "zh-CN";
  localStorage.setItem("wayflower-language", normalized);

  languageToggle.querySelector("span").textContent = isEnglish ? "中" : "EN";
  languageToggle.setAttribute("aria-label", isEnglish ? "切换到中文" : "Switch to English");
  languageToggle.setAttribute("title", isEnglish ? "切换到中文" : "Switch to English");

  const portrait = document.querySelector(".portrait img");
  if (portrait) {
    portrait.alt = isEnglish ? "Portrait of Jingtao Wei" : "魏靖弢的个人照片";
  }

  updatePageTitle(normalized);
  updateThemeButton();
  updateMenuButton(menuToggle.getAttribute("aria-expanded") === "true");

  if (projectList && loadedRepos.length) {
    renderProjects();
  }

  uploadLists.forEach((list) => {
    const files = uploadedFiles.get(list.dataset.uploadList);
    if (files) {
      renderUploadList(list, files);
    }
  });

  refreshIcons();
  document.dispatchEvent(new CustomEvent("wayflower:languagechange", { detail: { language: normalized } }));
}

setLanguage(requestedLanguage || savedLanguage || "zh");
setTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));

languageToggle.addEventListener("click", () => {
  setLanguage(currentLanguage() === "zh" ? "en" : "zh");
});

themeToggle.addEventListener("click", () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

function closeMenu() {
  document.body.classList.remove("menu-open");
  mobileNav.hidden = true;
  menuToggle.setAttribute("aria-expanded", "false");
  updateMenuButton(false);
  refreshIcons();
}

menuToggle.addEventListener("click", () => {
  const willOpen = mobileNav.hidden;
  document.body.classList.toggle("menu-open", willOpen);
  mobileNav.hidden = !willOpen;
  menuToggle.setAttribute("aria-expanded", String(willOpen));
  updateMenuButton(willOpen);
  refreshIcons();
});

mobileNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

window.addEventListener("resize", () => {
  if (window.innerWidth > 900 && !mobileNav.hidden) {
    closeMenu();
  }
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.14 }
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

function formatDate(dateString) {
  return new Intl.DateTimeFormat(currentLanguage() === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "short",
  }).format(new Date(dateString));
}

function createProjectRow(repo, index) {
  const isEnglish = currentLanguage() === "en";
  const link = document.createElement("a");
  link.className = "project-row reveal";
  link.href = repo.html_url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.setAttribute("aria-label", isEnglish ? `View ${repo.name} on GitHub` : `在 GitHub 查看 ${repo.name}`);

  const number = document.createElement("span");
  number.className = "project-index";
  number.textContent = String(index + 1).padStart(2, "0");

  const name = document.createElement("h3");
  name.className = "project-name";
  name.textContent = repo.name;

  const description = document.createElement("p");
  description.className = "project-description";
  description.textContent = repo.description || (isEnglish
    ? "Public project. Visit GitHub for details."
    : "公开项目，更多信息请前往 GitHub 查看。");

  const meta = document.createElement("div");
  meta.className = "project-meta";

  const language = document.createElement("span");
  language.className = "language";
  language.textContent = repo.language || "Code";

  const updated = document.createElement("time");
  updated.dateTime = repo.updated_at;
  updated.textContent = formatDate(repo.updated_at);

  const arrow = document.createElement("i");
  arrow.dataset.lucide = "arrow-up-right";
  arrow.setAttribute("aria-hidden", "true");

  meta.append(language, updated);
  link.append(number, name, description, meta, arrow);
  return link;
}

function showProjectFallback() {
  const isEnglish = currentLanguage() === "en";
  projectList.innerHTML = "";

  const fallback = document.createElement("a");
  fallback.className = "project-row";
  fallback.href = "https://github.com/wayflower?tab=repositories";
  fallback.target = "_blank";
  fallback.rel = "noreferrer";

  const number = document.createElement("span");
  number.className = "project-index";
  number.textContent = "01";

  const name = document.createElement("h3");
  name.className = "project-name";
  name.textContent = "GitHub Projects";

  const description = document.createElement("p");
  description.className = "project-description";
  description.textContent = isEnglish
    ? "The project list is unavailable. Visit GitHub directly."
    : "暂时无法读取项目列表，请直接前往 GitHub 查看。";

  const arrow = document.createElement("i");
  arrow.dataset.lucide = "arrow-up-right";
  arrow.setAttribute("aria-hidden", "true");

  fallback.append(number, name, description, arrow);
  projectList.append(fallback);
  projectList.setAttribute("aria-busy", "false");
  refreshIcons();
}

function renderProjects() {
  projectList.innerHTML = "";
  loadedRepos.forEach((repo, index) => {
    const row = createProjectRow(repo, index);
    projectList.append(row);
    observer.observe(row);
  });
  projectList.setAttribute("aria-busy", "false");
  refreshIcons();
}

async function loadProjects() {
  try {
    const response = await fetch("https://api.github.com/users/wayflower/repos?sort=updated&per_page=12", {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!response.ok) {
      throw new Error(`GitHub API responded with ${response.status}`);
    }

    loadedRepos = (await response.json())
      .filter((repo) => !repo.fork && repo.name !== "wayflower.github.io")
      .slice(0, 3);

    if (!loadedRepos.length) {
      showProjectFallback();
      return;
    }

    renderProjects();
  } catch (error) {
    console.warn("Unable to load GitHub projects:", error);
    showProjectFallback();
  }
}

function humanizeFilename(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderUploadList(list, files) {
  const isEnglish = currentLanguage() === "en";
  list.innerHTML = "";

  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "upload-empty";
    empty.textContent = isEnglish ? "No uploaded material yet." : "暂时没有已上传内容。";
    list.append(empty);
    list.setAttribute("aria-busy", "false");
    return;
  }

  files.forEach((file) => {
    const link = document.createElement("a");
    link.className = "upload-item";
    link.href = file.download_url || file.html_url;
    link.target = "_blank";
    link.rel = "noreferrer";

    const isImage = /\.(?:png|jpe?g|gif|webp)$/i.test(file.name);
    const preview = document.createElement("div");
    preview.className = "upload-preview";

    if (isImage) {
      const image = document.createElement("img");
      image.src = file.download_url;
      image.alt = humanizeFilename(file.name);
      image.loading = "lazy";
      preview.append(image);
    } else {
      const icon = document.createElement("i");
      icon.dataset.lucide = "file-text";
      icon.setAttribute("aria-hidden", "true");
      preview.append(icon);
    }

    const info = document.createElement("div");
    info.className = "upload-info";

    const title = document.createElement("h3");
    title.textContent = humanizeFilename(file.name) || file.name;

    const meta = document.createElement("p");
    const extension = file.name.includes(".") ? file.name.split(".").pop().toUpperCase() : "FILE";
    meta.textContent = `${extension} · ${formatFileSize(file.size)}`;

    const arrow = document.createElement("i");
    arrow.dataset.lucide = "arrow-up-right";
    arrow.setAttribute("aria-hidden", "true");

    info.append(title, meta);
    link.append(preview, info, arrow);
    list.append(link);
  });

  list.setAttribute("aria-busy", "false");
  refreshIcons();
}

async function loadManagedUploads(list) {
  const kind = list.dataset.uploadList;
  const endpoint = `https://api.github.com/repos/wayflower/wayflower.github.io/contents/assets/uploads/${kind}?ref=main`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (response.status === 404) {
      uploadedFiles.set(kind, []);
      renderUploadList(list, []);
      return;
    }

    if (!response.ok) {
      throw new Error(`GitHub API responded with ${response.status}`);
    }

    const files = (await response.json())
      .filter((item) => item.type === "file" && !item.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name, currentLanguage() === "en" ? "en" : "zh-CN"));

    uploadedFiles.set(kind, files);
    renderUploadList(list, files);
  } catch (error) {
    console.warn(`Unable to load ${kind} uploads:`, error);
    list.innerHTML = "";
    const message = document.createElement("p");
    message.className = "upload-empty";
    message.textContent = currentLanguage() === "en"
      ? "Uploaded material is temporarily unavailable."
      : "暂时无法读取已上传内容。";
    list.append(message);
    list.setAttribute("aria-busy", "false");
  }
}

document.querySelector("#current-year").textContent = new Date().getFullYear();
refreshIcons();

if (projectList) {
  loadProjects();
}

uploadLists.forEach((list) => loadManagedUploads(list));
