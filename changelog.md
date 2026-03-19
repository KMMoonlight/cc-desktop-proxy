# Changelog

## 2026-03-20 (最新)

### electron/preload.cjs

- 新增 IPC 通道：`getGitDiffViewData`（获取 Git 变更视图数据）、`getSession`（按 ID 获取会话）、`openGitDiffWindow`（打开 Git 变更独立窗口）
- `stopRun` 改为接受 `payload` 参数，支持按 workspaceId / sessionId 精确停止指定会话的运行

### electron/runtime.cjs

- **多会话并发运行**：`windowRuns` 从单一 runState 重构为 `Map<contentsId, Map<runKey, runState>>`，支持同一窗口内多个会话同时运行；新增 `createRunKey`、`createRunState` 工厂函数及一系列查找辅助方法（`getWindowRunStates`、`findRunStateForSession`、`findRunStateByApprovalRequest`、`getActiveRunStates`、`getActiveRunLookup`、`findActiveRunState`）
- **runToken 防竞态**：每次启动新进程时生成 `runToken`，stdout / stderr / close / error 回调均校验 token，防止旧进程事件污染新会话
- **Git 变更窗口**：新增 `openGitDiffWindow` 方法，为每个工作区维护独立的 `BrowserWindow`（存入 `gitDiffWindows` Map），支持复用已有窗口；`disposeAll` 时统一销毁
- **Git 变更数据**：新增 `getGitDiffViewData` / `serializeWorkspaceGitDiffView`，完整解析工作区 Git 变更（tracked + untracked），包含逐文件 diff patch、增删行数、状态（added / modified / deleted / renamed / copied / untracked 等）；新增大量 Git 解析工具函数（`collectWorkspaceGitDiffEntries`、`parseGitNameStatusEntries`、`parseGitNumstatMap`、`parseGitPatchMap`、`getGitUntrackedDiff`、`parseUnifiedDiffStats` 等）
- **工作区序列化增强**：`serializeWorkspace` 新增 `gitAddedLines`、`gitDeletedLines`、`gitDirty` 字段；`getWorkspaceGitInfo` 增加 `dirty` 状态检测及增删行统计（staged + unstaged + untracked）；Git 信息缓存 TTL 从 3s 延长至 10s
- **`addWorkspace` 行为变更**：工作目录已存在时改为抛出错误，不再静默切换选中状态
- **runState 重置提取**：将分散在 close / error / stop 中的重置逻辑统一提取为 `resetRunState` / `deleteRunState` 方法，消除重复代码
- `getSession` 新增 IPC 处理，支持前端按 workspaceId + sessionId 拉取完整会话数据

### src/App.jsx

- **多分屏布局**：新增 `paneLayout` 状态，支持 `single / columns / rows / grid` 四种布局模式，布局偏好持久化到 `localStorage`；新增 `Columns2`、`Rows2`、`Grid2x2` 图标及对应文案（中英双语）
- **分屏会话管理**：引入 `focusedPane` / `focusedSession` / `focusedWorkspace` 概念，composer 区域的模型、权限模式、消息历史均跟随当前聚焦分屏；新增 `sessionViewCache` 缓存非选中分屏的会话数据
- **`isSending` → `sendingPaneIds`**：发送状态从单一布尔值改为分屏 ID 数组，支持多分屏独立发送状态
- **Git 变更入口**：顶部栏新增"查看 Git 变更"按钮，调用 `openGitDiffWindow` IPC；新增 `viewGitChanges` 文案
- **视图路由**：`App` 组件新增 `getWindowView()` 判断，`view=git-diff` 时渲染 `GitDiffWindow` 组件，主界面提取为 `MainApp`
- 新增 `formatShortcutLabel` / `formatShortcutTooltip` 工具函数，统一处理跨平台快捷键标签显示

### src/components/git-diff-window.jsx（新文件）

- 新增独立的 Git 变更查看窗口组件，展示工作区所有文件变更（增删行数、状态标签、diff patch 内容）

---

## 2026-03-19 (最新)

### electron/preload.cjs

- 新增 IPC 通道：`openLink`（打开链接）、`pickAttachments`（选择附件）、`preparePastedAttachments`（处理粘贴附件）、`respondToApproval`（响应审批）
- 新增 `updateSessionPermissionMode` IPC 通道，支持为当前会话切换权限模式

### electron/runtime.cjs

- Schema 版本升级至 v5，新增 `approvalRules` 字段（工作区级别的审批规则持久化）
- 新增附件处理功能：支持通过文件选择器或粘贴方式添加附件，base64 数据自动保存至 userData 目录；支持图片及多种文档格式
- 新增审批流程：处理 `control_request` 事件，展示待审批卡片；支持 allow / deny / allow_always 三种决策；allow_always 会将规则持久化到工作区
- 新增权限模式管理：`updateSessionPermissionMode` 支持 `acceptEdits / auto / bypassPermissions / default / dontAsk / plan` 六种模式，并在启动 Claude 进程时通过 `--permission-mode` 传入
- 新增 Git 信息缓存：获取工作区分支信息（TTL 3秒），workspace 序列化时附带 `gitBranch`、`gitRoot` 字段
- 新增 `hasStreamedAssistantText` 标志，防止流式输出完成后创建多余的空助手消息
- 新增 `toolUses` Map，追踪工具调用详情；runState 重置时同步清空
- 工具描述系统重构：用 `describeToolUse` 替换原有 `summarizeToolInput/Result`，为各类工具（Read、Browse、Search、Command、Edit、WebFetch、Skill、MCP）添加专属格式化函数
- 新增链接处理：支持打开本地路径和外部链接
- Claude 进程通信切换为 `stream-json` 输入格式，通过 stdin 写入 JSON 行；新增 `--replay-user-messages` 和 `--permission-prompt-tool stdio` 参数
- 工具消息状态修复：进程关闭/停止/出错时调用 `finalizeRunningToolMessages` 将未完成工具消息标记为对应状态

### src/App.jsx

- 新增附件管理：composer 中支持添加、粘贴、移除附件
- 新增审批 UI：显示待审批项目卡片，支持允许/拒绝操作
- 新增消息历史导航：支持上下箭头键浏览历史消息
- 新增 Git 分支徽章：顶部栏显示当前工作区的 Git 分支（带截断处理）
- 助手消息渲染重构为分段模式（文本段 + 工具活动段），新增 `AssistantToolActivity` 组件
- `TypingIndicator` 改为接受 `label` / `labelLoading` props，显示 "Thinking" 文字标签
- 用户气泡颜色从硬编码改为 CSS 变量：`--user-bubble`、`--user-bubble-border`、`--user-bubble-foreground` 等
- 新增 Markdown 复制功能：代码块和表格支持一键复制

### src/index.css

- 新增用户气泡相关 CSS 变量，支持浅色/深色主题
- 新增工具活动加载动画（`loading-copy`、`loading-flash` 关键帧）
- 新增 Markdown 复制工具栏样式及表格滚动容器样式

### src/lib/markdown.js

- 为代码块和表格添加复制工具栏（动态生成复制按钮）
- 新增中英文复制按钮多语言支持

---

## 2026-03-19

### 当前改动总结

#### Electron / Runtime

- 将本地数据结构升级到 `schemaVersion: 3`，新增 `expandedWorkspaceIds` 持久化字段，以及会话级别的 `archived`、`currentModel` 状态。
- 扩展 Electron bridge 和 IPC 能力，新增归档话题、移除工作目录、保存展开态、更新会话模型、执行 `/mcp`、列出本地 skills、安装本地 skills 等接口。
- 会话选择逻辑改为只面向未归档会话；运行中的会话不能归档，正在执行中的工作目录不能移除。
- `sendMessage` 支持带展示元信息的命令消息，便于把 slash 命令以事件消息形式回显到时间线中。
- 运行时会额外暴露 Claude 可用模型列表和本地已安装 skills；模型信息通过解析 Claude 可执行文件提取，skills 同时扫描用户级和项目级目录。

#### 前端 / 交互

- `App.jsx` 大幅扩展为双语界面，新增中英文文案切换，并将语言偏好持久化到 `localStorage`。
- 新增主题切换能力，支持 `system / light / dark` 三种模式，并同步到文档根节点和浏览器 `color-scheme`。
- 左侧工作区面板增加会话搜索、工作目录展开/收起、展开状态持久化、工作目录移除、会话归档以及对应的确认弹窗。
- 输入区新增模型选择器，可直接为当前会话切换 Claude 模型，并展示当前模型标签与命令值。
- 新增 slash 命令菜单与命令执行流，支持 `/help`、`/clear`、`/theme`、`/model`、`/mcp`、`/skills`，以及根据已安装 skill 动态生成的自定义命令入口。
- 已安装 skill 的 slash 命令会被转换成结构化提示词发送给 Claude，保留命令形式的展示体验。
- 消息渲染新增命令消息样式、工具事件聚合展示、本地化时间格式，以及更细致的空状态文案。

#### UI / 样式

- 增加完整的暗色主题变量，并将应用背景渐变改为基于 CSS 变量驱动，支持主题切换时平滑过渡。
- 调整 `Input` 和 `Textarea` 的 focus ring，降低视觉强度；`ScrollArea` 增加稳定滚动条预留并修正滚动条定位。
- 顶栏、侧边栏、对话区和输入区整体视觉层次做了重新整理，强化了桌面应用式布局与状态信息呈现。

#### 其他

- `package-lock.json` 出现少量锁文件元数据刷新，若非手动依赖升级，推测为重新安装或重写 lockfile 后产生的 `peer` 标记更新。
