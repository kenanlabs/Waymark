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
  - 管理台卡片支持一键快捷复制**访问地址**、**用户名**与**密码**；配合内建浏览器脚本（`/waymark-bridge.user.js` + Tampermonkey），支持一键打开目标站点并自动填充登录。
- **轻量、安全与可移植**：
  - **管理员会话鉴权**：管理控制台需管理员登录后访问，密码通过 Node.js `crypto.scrypt` 加盐哈希存储，会话采用 HMAC-SHA256 签名 Cookie 校验。
  - **本地加密保险库**：敏感站点凭据仅保存在浏览器本地，支持设置主密码并通过 Web Crypto `AES-256-GCM` 加密持久化。
  - **批量导入导出**：支持 CSV 与 JSON 两种格式的站点导入、导出及全量备份恢复。

---

## 快速部署

### Docker 部署（推荐）

每次推送代码时，GitHub Actions（`.github/workflows/docker-publish.yml`）会自动构建镜像并推送至 GitHub Container Registry（GHCR），镜像 Tag 格式为 `<7位CommitID>-<UTC时间戳>`。

```bash
docker run -d \
  --name waymark \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=change_me_strong_password \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  ghcr.io/<your-github-username>/<your-repo-name>:<tag>
```

或使用 `docker-compose.yml`：

```yaml
services:
  waymark:
    image: ghcr.io/<your-github-username>/<your-repo-name>:<tag>
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
| `DATA_DIR` | `./data`（Docker 中为 `/app/data`） | 服务端持久化目录，用于保存管理员认证配置与公开工作空间只读索引 |
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
