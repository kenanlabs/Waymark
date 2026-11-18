# Waymark

**Waymark** 是一个极简、优雅的多工作空间统一入口导航与站点管理台。

你可以按业务线、使用场景、团队或个人习惯自由划分不同的**工作空间（Workspace）**，统一整理各类常用网站、内部系统、云服务、文档库、监控面板或后台管理入口；同时支持将指定工作空间通过**自定义路由**或**独立域名**对外公开分享，并严格隔离访问权限。

---

## 界面预览

> 将个人截图保存至 `docs/screenshots/` 目录（默认对应 `dashboard.png` 与 `public-view.png`），即可在文档中展示。

### 管理控制台

![Waymark 管理控制台](docs/screenshots/dashboard.png)

### 公开工作空间

![Waymark 公开工作空间](docs/screenshots/public-view.png)

---

## 核心特性

- **多工作空间自由组织**：支持创建多个独立工作空间，自定义空间名称、说明与图标；每个空间拥有独立的分组体系、站点列表、视图模式（卡片 / 详细表格）与置顶排序，不绑定特定系统类型。
- **双模式公开访问（自定义路由 + 独立域名）**：
  - **自定义路由**：为工作空间设置专属路径（例如 `/team`、`/tools`），即可通过 `https://your-domain.com/team` 直接访问。
  - **独立域名**：为工作空间绑定独立域名（例如 `nav.example.com`），配置 DNS 解析与反向代理后，访问该域名根路径 `/` 即可直达对应公开空间。
  - **严格只读隔离**：公开页面与接口仅返回站点名称、访问地址、分组与备注说明，彻底隔离安全入口、账号密码、自动登录信息与任何后台管理操作。
- **按需自动登录与快捷操作**：
  - 站点默认作为轻量导航入口使用，无需填写多余凭据；仅在开启「启用自动登录」后，按需配置入口路径与账号密码。
  - 管理台卡片支持一键快捷复制**访问地址**、**用户名**与**密码**；配合内建浏览器脚本（`/waymark-bridge.user.js` + 浏览器扩展），支持一键打开目标站点并自动填充表单登录；Nginx 等 HTTP Basic 认证通过启动链接携带凭据由浏览器原生完成。
- **轻量、安全与可移植**：
  - **管理员会话鉴权**：管理控制台需管理员登录后访问，密码通过 Node.js `crypto.scrypt` 加盐哈希存储，会话采用 HMAC-SHA256 签名 Cookie 校验。
  - **服务端持久化与跨端同步**：工作空间与站点数据持久保存于服务端 `DATA_DIR`（`/app/data`），切换 IP、域名或设备登录均可自动同步；支持设置本地主密码二次保护。
  - **批量导入导出**：支持 CSV 与 JSON 两种格式的站点导入、导出及全量备份恢复。

---

## 快速部署

### Docker 部署（推荐）

每次推送代码时，GitHub Actions（`.github/workflows/docker-publish.yml`）会自动构建镜像并推送至 GitHub Container Registry（GHCR），同时生成 `<7位CommitID>-<UTC时间戳>` 与 `latest` 两个标签。

```bash
docker run -d \
  --name waymark \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=change_me_strong_password \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  ghcr.io/<your-github-username>/<your-repo-name>:latest
```

或使用 `docker-compose.yml`：

```yaml
services:
  waymark:
    image: ghcr.io/<your-github-username>/<your-repo-name>:latest
    container_name: waymark
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      PORT: 3000
      DATA_DIR: /app/data
      # 可选：若未配置环境变量，首次访问 Web 页面时将引导初始化管理员账号
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: change_me_strong_password
      SESSION_SECRET: replace_with_random_hex_secret
```

#### 环境变量说明

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `3000` | 服务监听端口 |
| `DATA_DIR` | `./data`（Docker 中为 `/app/data`） | 服务端持久化目录，保存管理员账号配置、全部工作空间与站点数据及公开空间只读索引 |
| `ADMIN_USERNAME` | 未设置 | 可选，预设管理员用户名；未设置时首次访问页面可在界面引导创建 |
| `ADMIN_PASSWORD` | 未设置 | 可选，预设管理员密码；与 `ADMIN_USERNAME` 配合使用 |
| `SESSION_SECRET` | 随机生成 | 建议在生产环境显式指定固定随机字符串，避免重启容器后登录态失效 |

---

### 反向代理与独立域名配置

如果为某个公开工作空间配置了**独立访问域名**（例如 `portal.example.com`），请将域名 DNS 解析至服务器，并在反向代理中保留并透传 `Host` 与 `X-Forwarded-Host` 请求头：

```nginx
server {
    listen 80;
    server_name waymark.example.com portal.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

配置生效后：
- 访问 `waymark.example.com` 进入管理控制台；
- 访问 `portal.example.com` 将直接匹配并展示对应的公开工作空间。

---

## 自动登录与连通性检测

### 登录页协议与验证码

部分面板（例如 1Panel v2）的登录页要求勾选「同意《软件许可协议》」。Waymark 只负责填充用户名与密码，**不会替你勾选协议**；检测到未勾选的协议时会保留已填充内容并提示手动勾选。若页面使用了验证码，脚本同样会保留已填充的账号密码并提示手动完成验证码。

### HTTP Basic 认证（Nginx 等）

在站点编辑中把「认证方式」切换为 `HTTP Basic 认证（Nginx 等）`。点击卡片时，Waymark 会把用户名和密码写入启动链接的 userinfo 部分（`https://<user>:<password>@host/path`），浏览器收到 `401 WWW-Authenticate: Basic` 后会用该凭据自动完成原生认证。

- 这是纯前端方案，不修改 Nginx 配置，也不需要服务端探测。
- Chrome / Edge 会在地址栏隐藏凭据；Firefox 首次可能弹出确认，选择允许即可。
- 浏览器原生的 Basic 认证弹窗无法由 JavaScript 书签脚本填充，因此 Basic 模式不使用书签脚本。
- Basic 凭据会出现在浏览历史/启动链接中，建议仅通过 HTTPS 使用；共享设备上请谨慎。

### 脚本更新后仍不生效

油猴脚本只在页面加载时注入，更新脚本不会自动替换已经打开的标签页：

- 更新脚本后请刷新 Waymark 页面；如果顶部出现「脚本需刷新」，说明当前页面仍在运行旧脚本，刷新即可。
- 关闭旧的 1Panel 标签页（或刷新它）后再点击卡片。旧标签页不会获得新脚本。
- Waymark 脚本不会点击登录页的「同意/许可协议」；协议被勾选通常是 1Panel 或浏览器记住了上一次的状态。
- 若 1Panel 把密码框切换成了明文输入框，脚本也会按 `autocomplete`、`name`、`id`、`placeholder` 识别并填充。

### 客户端连通性检测为什么显示「受限」

当 Waymark 通过 **HTTPS** 访问，而目标站点是 **HTTP** 时，浏览器会以「混合内容（Mixed Content）」策略阻止页面内的 `fetch`、`img`、`script` 等探测请求。这不是 CORS 配置能解决的问题，也不能通过在响应里加 `Access-Control-Allow-Origin` 绕过：

- **推荐方案（仍是客户端检测）**：安装/更新浏览器扩展脚本后，Waymark 会通过脚本的 `GM_xmlhttpRequest` 特权请求完成检测，可绕过 CORS、混合内容与私有网络访问（PNA）限制，不依赖服务端探测。
- **无插件方案**：浏览器会直接阻止上述请求，Waymark 将状态标记为「受限」而不是「不可达」；请点击卡片直接打开验证，或为目标站点配置 HTTPS。
- **内网目标**：公网页面访问内网 IP 还会触发浏览器 PNA 策略；请在内网环境访问 Waymark，或安装脚本后由脚本代理检测。
- 脚本首次访问新的目标域名时，脚本管理器可能弹出跨域授权提示，请选择「始终允许」。

### 书签脚本拖拽无效时

部分浏览器会忽略拖拽到书签栏的 `javascript:` 链接。此时在站点编辑抽屉中点击「复制代码」，然后在浏览器的书签管理器中新建书签，把代码粘贴到「网址 / URL」栏即可。书签保存后，在目标登录页点击一次即可填充；启用自动提交且页面没有协议/验证码阻塞时会提交登录。

---

## 本地开发

环境要求：**Node.js >= 22**。

```bash
# 安装依赖
npm install

# 启动开发服务器（默认访问 http://localhost:3000）
npm run dev

# 类型检查
npm run lint

# 构建生产前端产物
npm run build

# 以生产模式启动
NODE_ENV=production npm start
```
