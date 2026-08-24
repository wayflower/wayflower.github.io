# wayflower.github.io

魏靖弢（Wayflower）的双语个人主页，使用原生 HTML、CSS 和 JavaScript 构建，可直接部署到 GitHub Pages。

页面包括：

- `index.html`：个人主页与 GitHub 公开项目
- `cv.html`：中英文个人简历
- `papers.html`：论文成果与管理员上传入口
- `showcase.html`：竞赛成果、校园经历与个人兴趣

语言与深浅色选择会保存在浏览器中，并在页面之间保持一致。

## 本地预览

直接打开 `index.html` 即可浏览。若要完整测试 GitHub API 请求，建议在项目目录运行一个本地静态服务器：

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 部署到 GitHub Pages

1. 在 GitHub 的 `wayflower` 账号下创建公开仓库 `wayflower.github.io`。
2. 将本项目提交并推送到 `main` 分支。
3. 在仓库的 `Settings > Pages` 中选择 `Deploy from a branch`，分支选择 `main`，目录选择 `/ (root)`。
4. 稍等片刻后访问 `https://wayflower.github.io/`。

```powershell
git add .
git commit -m "Create personal homepage"
git push -u origin main
```

主页会通过 GitHub 公共 API 自动展示最近更新的三个非 fork 仓库。核心文案位于 `index.html`，配色与布局位于 `styles.css`。

## 内容管理入口

个人展示页的上传入口复用后端 GitHub OAuth 校验。只有当前登录名严格等于 `wayflower` 时，才会跳转到 GitHub 官方仓库上传页；网页不会保存密码、OAuth 密钥或访问令牌。

- 个人展示材料上传到 `assets/uploads/showcase/`

提交到 `main` 分支后，展示页会通过 GitHub Contents API 自动读取并显示文件。GitHub 网页端上传限制为单文件 25 MiB；更大的文件应通过 Git 或 Git LFS 管理。

## 论文数据与 GitHub 验证

论文列表存放在 `assets/data/papers.json`，每条记录包含 `title`、`authors`、`image` 和 `url`。论文页会把每条记录渲染为左侧截图、右侧标题与作者信息的独立条目。

论文上传前端通过 `backend/` 中的独立 Node.js 服务完成 GitHub OAuth 身份验证和仓库写入：

- `GET /auth/github/start`：生成 PKCE、随机 `state` 并跳转到 GitHub 登录页。
- `GET /auth/github/callback`：交换 GitHub access token，通过 `/user` 读取当前账号并严格匹配 `wayflower`。
- `POST /auth/github/session`：使用回调返回的一次性兑换码换取 15 分钟有效的上传令牌。
- `POST /papers`：使用 `Authorization: Bearer <token>`，以 multipart form-data 提交 `title`、`authors`、`image`、`url`。

OAuth 登录不申请仓库 scope，只读取公开账号资料。GitHub access token 不会发送给浏览器或写进上传令牌；账号验证后，后端仅将一个 2 分钟有效且只能使用一次的兑换码放入 URL fragment。论文写入使用单独的仓库专用 Fine-grained Token。

后端还包含以下限制：OAuth 启动按 IP 限流、上传截图限制为 5 MB 且仅接受 PNG/JPEG/WebP、CORS 仅允许正式站点与本地预览地址。

### 创建 GitHub OAuth App

1. 在 GitHub 的 `Settings > Developer settings > OAuth Apps` 中创建 OAuth App。
2. 正式环境的 Homepage URL 填写 `https://wayflower.github.io`。
3. Authorization callback URL 填写后端 HTTPS 地址加 `/auth/github/callback`。
4. 将 Client ID 和 Client Secret 分别配置为后端的 `GITHUB_OAUTH_CLIENT_ID`、`GITHUB_OAUTH_CLIENT_SECRET`。
5. 创建仅限 `wayflower/wayflower.github.io` 仓库、权限为 `Contents: Read and write` 的 Fine-grained Token，并配置为 `GITHUB_TOKEN`。
6. 生成至少 32 个随机字符作为 `TOKEN_SECRET`。

本地与正式环境应使用不同的 OAuth App。本地回调可设为 `http://127.0.0.1:8787/auth/github/callback`，对应 `FRONTEND_AUTH_RETURN_URL=http://127.0.0.1:8000/papers.html`。

本地安装和测试：

```powershell
cd backend
npm ci
npm test
npm start
```

健康检查地址为 `/health`。

### 部署后端

`backend/Dockerfile` 可部署到支持常驻 Docker/Node 服务的平台。当前 OAuth state、一次性兑换码与限流状态保存在进程内存中，因此部署时使用单实例；需要横向扩容时应先改用 Redis 等共享存储。

后端部署完成后，把 `papers.html` 与 `showcase.html` 中 `owner-api-base` 元标签的 `content` 设置为 HTTPS API 地址，例如：

```html
<meta name="owner-api-base" content="https://paper-api.example.com">
```

OAuth Client Secret、`TOKEN_SECRET` 和 GitHub Token 只能配置在后端平台的私密环境变量中，不能写入 GitHub Pages、提交到仓库或发送给浏览器。

## 视觉资产

`assets/images/hero-workspace.png` 由 OpenAI 内置 ImageGen 生成，用于本项目首页主视觉。
