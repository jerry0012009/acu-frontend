# Stash 功能分析 - 2026-09-28

> 校正（2026-09-28 仓库整理）：下文保留为历史调查记录，不应直接作为实施依据。
> `administratorAllowed` 是 Router API profile 数据中的字段访问，当前 DTO 已有
> 对应 JSON 字段和缺省兼容。仅在 new-api 数据库找不到同名列，不能证明需要迁移
> schema；应核对 Router 的实际返回契约。当前规范开发/构建目录是
> `/root/jerry/acu-frontend`，`/root/jerry/new-api` 的未提交实现已保存为恢复分支。
> 探针、模型可见性、流式 EOF 及配套 UI 仍需分别验证；下文的“安全/低风险”不是
> 测试结论。恢复位置见 `/root/jerry/acu-repo-management/README.md`。

## 背景

本地 main 分支与 origin/main 分叉，相差 47 个提交。已完成 rebase，代码已同步到最新状态。
Stash 中保存了本地的调试和功能改进，需要基于新代码基准重新评估和整合。

## Stash 中的主要功能

### 1. Full Pool Probe API（新功能）

**影响文件**：

- `controller/acu_channel_monitor.go` - 新增 `TriggerACUFullPoolProbe` handler
- `service/acu_channel_monitor.go` - 实现 probe 逻辑
- `router/api-router.go` - 注册路由

**功能描述**：
手动触发全量渠道健康探针，用于调试和运维。

**状态**：✅ 有价值，需要整合
**优先级**：中

---

### 2. Pricing Catalog 改进

**影响文件**：

- `controller/acu_pricing_catalog.go`
- `controller/acu_pricing_catalog_test.go`

**主要变更**：

1. ❌ **移除 fallback catalog 逻辑** - 删除了 `ACU_PRICING_FALLBACK_CATALOG_FILE` 环境变量支持
2. ✅ **支持 Chat Completions 协议** - 在 `acuEndpointTypes()` 中添加 OpenAI endpoint
3. ✅ **动态 capabilities 显示** - 只显示实际支持的 Tool Call / Reasoning

**状态**：部分有价值

- Chat Completions 支持：需要整合
- 移除 fallback：需要评估是否安全（生产环境可能依赖）

**优先级**：高

---

### 3. Model 过滤逻辑重构

**影响文件**：

- `controller/model.go`
- `controller/model_list_test.go`

**主要变更**：

- 函数重命名：`filterPublicACUModelsByChatCapability` → `filterPublicACUModelsByProfileVisibility`
- 新增过滤条件：`administratorAllowed == false` 时隐藏模型
- 简化逻辑：不再区分 chat_completions 和 messages 协议，统一基于 profile visibility

**状态**：✅ 架构改进，需要整合
**优先级**：高

---

### 4. 前端组件更新

**影响文件**：

- `web/src/features/pricing/` - 3 个文件
- `web/src/features/usage-logs/components/` - 6 个文件

**主要变更**：
前端展示逻辑调整，与后端 API 变更配套。

**状态**：待确认（需要后端 API 先整合）
**优先级**：低（后端稳定后再整合）

---

### 5. 其他调试修改

**影响文件**：

- `dto/acu_channel_monitor.go` - 数据结构调整
- `relay/channel/openai/relay-openai.go` - 可能的错误处理改进
- `controller/pricing.go` - 小改动
- `service/acu_channel_monitor_test.go` - 测试更新

**状态**：待详细审查
**优先级**：低

---

## 整合策略

### 阶段 1：验证基础功能（当前）

1. ✅ 完成 rebase，代码同步到最新
2. ✅ 构建新镜像成功
3. ⏳ 推送镜像并部署
4. ⏳ 验证 `acu-film` 路由工作正常

### 阶段 2：整合可行功能（推荐）

**可以安全整合的功能**：

1. **Pricing Catalog - Chat Completions 支持**（高优先级 ✅）
   - 重新应用 `acuEndpointTypes()` 的 Chat Completions 支持
   - 重新应用动态 capabilities 显示逻辑
   - **风险**：低，纯新增功能

2. **Full Pool Probe API**（中优先级 ✅）
   - 重新实现 `TriggerACUFullPoolProbe` 功能
   - 注册路由
   - **风险**：低，独立功能

**暂不整合的功能**：

1. **Model 过滤逻辑重构**（❌ 阻塞）
   - **原因**：依赖数据库中不存在的 `administratorAllowed` 字段
   - **需要**：先在数据库 schema 中添加该字段

2. **移除 fallback catalog**（❌ 高风险）
   - **原因**：可能影响生产环境容错能力
   - **需要**：先确认生产环境是否依赖

### 阶段 3：前端同步

- 在后端 API 稳定后，整合前端组件更新

---

## 风险评估

### 高风险

- ❌ **移除 fallback catalog**：可能影响生产环境的容错能力
  - **建议**：先确认生产环境是否使用，再决定是否移除

### 中风险

- ❌ **Model 过滤逻辑**：依赖 `administratorAllowed` 字段
  - **状态**：数据库中不存在该字段（已验证）
  - **建议**：暂不整合，需要先在数据库层实现该字段

### 低风险

- ✅ **Chat Completions 支持**：纯新增功能
- ✅ **Full Pool Probe**：独立功能，不影响现有逻辑

---

## 下一步行动

1. 等待镜像构建完成
2. 部署新镜像，验证 `acu-film` 路由
3. 查询数据库确认 `administratorAllowed` 字段
4. 逐个功能重新实现并测试
