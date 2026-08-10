# ACUindex 生产部署约定

本文档是 ACUindex 定制 New API 的生产部署入口。通用 New API 安装说明仍适用于独立部署，但当前 `acucompute.com` 域名体系必须遵循本页，避免控制台路径、客户端 Base URL 与 ACU Router 版本漂移。

## 1. 服务边界

| 职责 | 公开入口 | 内部入口 |
| --- | --- | --- |
| ACUindex 官网 | `https://acucompute.com/` | `127.0.0.1:4173` |
| 控制台 | `https://console.acucompute.com/` | `127.0.0.1:3200` |
| Dashboard | `https://console.acucompute.com/dashboard/overview` | `127.0.0.1:3200` |
| 模型定价 | `https://console.acucompute.com/pricing` | `127.0.0.1:3200` |
| Codex ACU Responses | `https://api.acucompute.com/v1` | New API `/v1/responses` |
| Claude ACU Messages | `https://api.acucompute.com/v1/messages` | New API `/v1/messages` |
| Codex release mirror | `https://api.acucompute.com/codex-releases/` | ACU host static cache |
| Router Demo | `https://demo.acucompute.com/` | `127.0.0.1:8402` |
| 旧客户端兼容 | `https://eu.jerrypsy.top:8443/v1` | New API `/v1/*` |

New API Console 以域名根路径运行，不设置 `/console` 或 `/acu` basename。浏览器 API 请求和构建资源继续使用根绝对路径 `/api/` 与 `/static/`，由 Nginx 精确代理。不要通过字符串替换构建产物来增加前缀。

## 2. 版本化配置来源

- New API 源码：`/root/jerry/new-api` 的 `main`；
- Alpha Compose：Claw Router 仓库的 `deploy/alpha/docker-compose.yml`；
- 公网路由：Claw Router 仓库的 `deploy/alpha/nginx-acu-public-locations.conf`；
- Secret：`/root/jerry/new-api/.env`，仅服务器本地保存，不提交；
- 数据：Compose 的 PostgreSQL / ACU 数据卷，不随镜像重建。

当前 Alpha 不使用本仓库根目录的通用 `docker-compose.yml` 发布生产 New API，也不使用公共 `calciumion/new-api:latest` 覆盖定制镜像。

## 3. 发布步骤

先确保 New API 与 Claw Router 都在已推送的 `main`，工作树干净：

```bash
git -C /root/jerry/new-api fetch origin
git -C /root/jerry/new-api status --short --branch
git -C /root/jerry/claw-router fetch origin
git -C /root/jerry/claw-router status --short --branch
```

执行前端检查：

```bash
cd /root/jerry/new-api/web
bun run typecheck
bun run lint
bun run build
```

使用 Claw Router Compose 构建带可追溯 Commit 的镜像：

```bash
cd /root/jerry/claw-router/deploy/alpha
NEW_API_BUILD_COMMIT_SHA=$(git -C /root/jerry/new-api rev-parse HEAD) \
NEW_API_BUILD_BRANCH=main \
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
docker compose --env-file /root/jerry/claw-router/.env build new-api

docker compose --env-file /root/jerry/claw-router/.env \
  up -d --no-deps new-api
```

等待健康检查变为 `healthy`，不要在新容器健康前删除旧镜像：

```bash
docker inspect acu-router-alpha-new-api-1 \
  --format 'status={{.State.Status}} health={{.State.Health.Status}}'
curl -fsS http://127.0.0.1:3200/api/status
```

## 4. Nginx 接入

生产入口由独立 Nginx vhost 提供：

- `acucompute.com` → FrontendQD `127.0.0.1:4173`
- `console.acucompute.com` → New API `127.0.0.1:3200`
- `api.acucompute.com` → New API `127.0.0.1:3200`
- `demo.acucompute.com` → 正式 Demo `127.0.0.1:8402`

修改后固定执行：

```bash
nginx -t
systemctl reload nginx
```

不要把公网 API 或 Demo 代理到 8403；Docker 私网 ACU Router 和宿主机 `clawrouter-dev.service` 都不是正式公网入口。不要删除独立的 `acu-api-direct.jerrypsy.top` 或 `eu.jerrypsy.top:8443` 配置，它们保留为既有客户端兼容入口。

## 5. 客户端入口

Codex ACU：

```text
base_url = "https://api.acucompute.com/v1"
model = "acu-auto"
wire_api = "responses"
```

Codex ACU 的用户安装命令由控制台按 Token 动态生成，Unix 命令形态为：

```bash
{ curl -fsSL https://api.acucompute.com/codex-acu-install.sh || \
  curl -fsSL https://acu-api-direct.jerrypsy.top/codex-acu-install.sh || \
  curl -fsSL https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu/install.sh; } \
  | ACU_API_KEY='sk-用户Token' sh
```

Windows PowerShell：

```powershell
$env:ACU_API_KEY='sk-用户Token'; try { irm 'https://api.acucompute.com/codex-acu-install.ps1' | iex } catch { try { irm 'https://acu-api-direct.jerrypsy.top/codex-acu-install.ps1' | iex } catch { irm 'https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu/install.ps1' | iex } }
```

Windows Command Prompt（`C:\>`）：

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$env:ACU_API_KEY='sk-用户Token'; try { irm 'https://api.acucompute.com/codex-acu-install.ps1' | iex } catch { try { irm 'https://acu-api-direct.jerrypsy.top/codex-acu-install.ps1' | iex } catch { irm 'https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu/install.ps1' | iex } }"
```

安装器在私有 `codex-acu` 目录中维护最新版 Codex，不会覆盖用户已有的
`codex`。安装时先尝试 npm 官方 Registry 和 `registry.npmmirror.com`，
再回退 direct/public ACU release mirror 与 OpenAI standalone installer。镜像由
ACU host 的 systemd timer 每 6 小时更新，下载后校验 upstream SHA-256，
保留最近三个版本。它会在正式 API 与 direct Responses 备用入口之间
选择可用地址，保存独立 `CODEX_HOME` 和本地凭据，并执行一次真实 Codex ACU
验收。

Claude ACU 的页面安装命令（控制台会生成带 Token 和多地域回退的完整命令）：

```bash
curl -fsSL https://api.acucompute.com/claude-acu-install.sh | ACU_API_KEY='sk-用户Token' sh
```

上面的 `curl ... | ACU_API_KEY=... sh` 仅适用于 macOS、Linux 和 WSL。
Windows PowerShell 应使用：

```powershell
$env:ACU_API_KEY='sk-用户Token'; try { irm 'https://api.acucompute.com/claude-acu-install.ps1' | iex } catch { try { irm 'https://acu-api-direct.jerrypsy.top/claude-acu-install.ps1' | iex } catch { irm 'https://raw.githubusercontent.com/jerry0012009/acu-frontend/main/web/public/claude-acu-install.ps1' | iex } }
```

Windows Command Prompt（`C:\>`）应使用：

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$env:ACU_API_KEY='sk-用户Token'; try { irm 'https://api.acucompute.com/claude-acu-install.ps1' | iex } catch { try { irm 'https://acu-api-direct.jerrypsy.top/claude-acu-install.ps1' | iex } catch { irm 'https://raw.githubusercontent.com/jerry0012009/acu-frontend/main/web/public/claude-acu-install.ps1' | iex } }"
```

安装器会在 `https://api.acucompute.com` 与 direct 域名之间实际探测可用
Messages 入口，然后保存 `ANTHROPIC_BASE_URL` 和 `model=acu-auto`，保留
Claude Code 自身的模型默认上下文上限。默认在私有 `claude-acu` 目录中从
npm / npmmirror 安装或更新最新版 Claude Code；npm 不可用时回退 Anthropic
standalone installer；如果本机已有 Claude，则直接复用系统版本以保证安装完成。
安装器默认只做 HTTP ACU 验证，不启动可能受本机网络影响的 CLI 试跑；需要执行
CLI 验证时设置 `CLAUDE_ACU_CLI_VERIFY=1`，最多等待 45 秒，超时只提示而不会撤销
已写入的配置。需要保留已有 Claude 版本时可设置
`CLAUDE_ACU_UPDATE_CLAUDE=0`，需要调整等待时间时可设置
`CLAUDE_ACU_VERIFY_TIMEOUT_SEC`。`:8443` 永久保留既有客户端兼容，但不是新客户文档入口。

## 6. 发布验收

```bash
curl -fsSI https://console.acucompute.com/
curl -fsSI https://console.acucompute.com/dashboard/overview
curl -fsSI https://console.acucompute.com/usage-logs/channel-monitor
curl -fsS https://api.acucompute.com/api/status
curl -fsS https://api.acucompute.com/claude-acu-install.sh | \
  grep 'ACU_PUBLIC_BASE_URL="https://api.acucompute.com"'
curl -fsS https://api.acucompute.com/codex-acu-install.sh | \
  grep 'registry.npmmirror.com'
curl -fsS https://api.acucompute.com/codex-acu-install.sh | \
  grep 'ACU_API_KEY'
curl -fsS https://api.acucompute.com/codex-releases/version.json
```

再分别执行一条最小 `codex-acu` 和 `claude-acu` 请求。HTTP 200 只能证明入口存在，真实客户端完成才能证明 Responses / Messages 协议和 Token 路由均可用。

## 7. 回滚

1. 记录当前 New API Commit 和镜像 ID；
2. 切换到已审核且已推送的旧 Commit；
3. 使用相同 Build Commit 参数重建；
4. 只重建 `new-api` 服务，不执行 `down -v`；
5. 重新验证 `/api/status`、两种客户端协议和 ACU usage finalize。

数据库迁移和数据卷回滚必须单独审批。任何时候都禁止用 `git reset --hard`、覆盖本地 Secret 或删除 Compose volume 作为普通代码回滚手段。
