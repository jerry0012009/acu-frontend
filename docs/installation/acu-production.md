# ACUindex 生产部署约定

本文档是 ACUindex 定制 New API 的生产部署入口。通用 New API 安装说明仍适用于独立部署，但当前 `eu.jerrypsy.top` 环境必须遵循本页，避免控制台路径、客户端 Base URL 与 ACU Router 版本漂移。

## 1. 服务边界

| 职责 | 公开入口 | 内部入口 |
| --- | --- | --- |
| ACUindex 官网 | `https://eu.jerrypsy.top/acu/index/` | `127.0.0.1:4173` |
| 使用教程 / New API | `https://eu.jerrypsy.top/acu/` | `127.0.0.1:3200` |
| 控制台 | `https://eu.jerrypsy.top/acu/dashboard/overview` | `127.0.0.1:3200` |
| 模型定价 | `https://eu.jerrypsy.top/acu/pricing` | `127.0.0.1:3200` |
| Codex ACU Responses | `https://acu-api-direct.jerrypsy.top/v1` | New API `/v1/responses` |
| Claude ACU Messages | `https://eu.jerrypsy.top/acu` | New API `/v1/messages` |
| Codex release mirror | `https://acu-api-direct.jerrypsy.top/codex-releases/` | ACU host static cache |
| Router Demo | `https://eu.jerrypsy.top/acu-router/` | `127.0.0.1:8402` |

New API 的浏览器 Router 会在地址以 `/acu` 开头时自动使用 `/acu` base path；根路径部署仍保持兼容。浏览器 API 请求和构建资源仍使用根绝对路径 `/api/` 与 `/static/`，由版本化 Nginx snippet 精确代理。不要通过字符串替换构建产物来增加前缀。

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
npm run typecheck
npx oxlint src/main.tsx
npm run build
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

443 虚拟主机必须包含 Claw Router 仓库中的版本化 location 文件：

```nginx
include /root/jerry/claw-router/deploy/alpha/nginx-acu-public-locations.conf;
```

修改后固定执行：

```bash
nginx -t
systemctl reload nginx
```

不要把 `/acu` 代理到 8403；8403 是 Docker 私网 ACU Router，不对宿主机或公网发布。不要删除独立的 `acu-api-direct.jerrypsy.top` 配置，Codex ACU 使用该域名避免网页路由与长时 Responses 流互相耦合。

## 5. 客户端入口

Codex ACU：

```text
base_url = "https://acu-api-direct.jerrypsy.top/v1"
model = "acu-auto"
wire_api = "responses"
```

Codex ACU 的用户安装命令由控制台按 Token 动态生成，Unix 命令形态为：

```bash
{ curl -fsSL https://eu.jerrypsy.top/acu/codex-acu-install.sh || \
  curl -fsSL https://acu-api-direct.jerrypsy.top/codex-acu-install.sh || \
  curl -fsSL https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu/install.sh; } \
  | ACU_API_KEY='sk-用户Token' sh
```

Windows PowerShell：

```powershell
$env:ACU_API_KEY='sk-用户Token'; try { irm 'https://eu.jerrypsy.top/acu/codex-acu-install.ps1' | iex } catch { try { irm 'https://acu-api-direct.jerrypsy.top/codex-acu-install.ps1' | iex } catch { irm 'https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu/install.ps1' | iex } }
```

Windows Command Prompt（`C:\>`）：

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$env:ACU_API_KEY='sk-用户Token'; try { irm 'https://eu.jerrypsy.top/acu/codex-acu-install.ps1' | iex } catch { try { irm 'https://acu-api-direct.jerrypsy.top/codex-acu-install.ps1' | iex } catch { irm 'https://raw.githubusercontent.com/jerry0012009/ClawRouter/main/tools/codex-acu/install.ps1' | iex } }"
```

安装器在私有 `codex-acu` 目录中维护最新版 Codex，不会覆盖用户已有的
`codex`。安装时先尝试 npm 官方 Registry 和 `registry.npmmirror.com`，
再回退 direct/public ACU release mirror 与 OpenAI standalone installer。镜像由
ACU host 的 systemd timer 每 6 小时更新，下载后校验 upstream SHA-256，
保留最近三个版本。它会在 direct Responses 入口与 `/acu/v1` 备用入口之间
选择可用地址，保存独立 `CODEX_HOME` 和本地凭据，并执行一次真实 Codex ACU
验收。

Claude ACU 的页面安装命令（控制台会生成带 Token 和多地域回退的完整命令）：

```bash
curl -fsSL https://eu.jerrypsy.top/acu/claude-acu-install.sh | ACU_API_KEY='sk-用户Token' sh
```

上面的 `curl ... | ACU_API_KEY=... sh` 仅适用于 macOS、Linux 和 WSL。
Windows PowerShell 应使用：

```powershell
$env:ACU_API_KEY='sk-用户Token'; try { irm 'https://eu.jerrypsy.top/acu/claude-acu-install.ps1' | iex } catch { try { irm 'https://acu-api-direct.jerrypsy.top/claude-acu-install.ps1' | iex } catch { irm 'https://raw.githubusercontent.com/jerry0012009/acu-frontend/main/web/public/claude-acu-install.ps1' | iex } }
```

Windows Command Prompt（`C:\>`）应使用：

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$env:ACU_API_KEY='sk-用户Token'; try { irm 'https://eu.jerrypsy.top/acu/claude-acu-install.ps1' | iex } catch { try { irm 'https://acu-api-direct.jerrypsy.top/claude-acu-install.ps1' | iex } catch { irm 'https://raw.githubusercontent.com/jerry0012009/acu-frontend/main/web/public/claude-acu-install.ps1' | iex } }"
```

安装器会在 `https://eu.jerrypsy.top/acu` 与 direct 域名之间实际探测可用
Messages 入口，然后保存 `ANTHROPIC_BASE_URL`、`model=acu-auto` 和
`CLAUDE_CODE_MAX_CONTEXT_TOKENS=272000`。没有 Claude Code 时优先从 npm /
npmmirror 安装，失败后使用 Anthropic standalone installer。禁止恢复 `:8443`
地址；8443 只保留临时兼容，不是客户文档入口。

## 6. 发布验收

```bash
curl -fsSI https://eu.jerrypsy.top/acu/
curl -fsSI https://eu.jerrypsy.top/acu/dashboard/overview
curl -fsSI https://eu.jerrypsy.top/acu/usage-logs/channel-monitor
curl -fsS https://eu.jerrypsy.top/api/status
curl -fsS https://acu-api-direct.jerrypsy.top/healthz
curl -fsS https://eu.jerrypsy.top/acu/claude-acu-install.sh | \
  grep 'ANTHROPIC_BASE_URL="https://eu.jerrypsy.top/acu"'
curl -fsS https://eu.jerrypsy.top/acu/codex-acu-install.sh | \
  grep 'registry.npmmirror.com'
curl -fsS https://acu-api-direct.jerrypsy.top/codex-acu-install.sh | \
  grep 'ACU_API_KEY'
curl -fsS https://acu-api-direct.jerrypsy.top/codex-releases/version.json
```

再分别执行一条最小 `codex-acu` 和 `claude-acu` 请求。HTTP 200 只能证明入口存在，真实客户端完成才能证明 Responses / Messages 协议和 Token 路由均可用。

## 7. 回滚

1. 记录当前 New API Commit 和镜像 ID；
2. 切换到已审核且已推送的旧 Commit；
3. 使用相同 Build Commit 参数重建；
4. 只重建 `new-api` 服务，不执行 `down -v`；
5. 重新验证 `/api/status`、两种客户端协议和 ACU usage finalize。

数据库迁移和数据卷回滚必须单独审批。任何时候都禁止用 `git reset --hard`、覆盖本地 Secret 或删除 Compose volume 作为普通代码回滚手段。
