# Changelog

## 2026-03-21（当前工作区变更汇总）

### Provider / Runtime / 持久化

- 本地 store schema 升级到 `v8`，新增 `codeEditor`、`providerSystemPrompts`、会话级 `reasoningEffort` / `codexPlanModeActive` 等字段；`createSession` 也支持带 `preferredProvider` 新建会话
- Provider 状态从“CLI 是否可用”扩展为“可用性 + 本地状态概览”：Claude 会读取本地统计缓存和 settings，展示当前模型、常用模型、连续活跃、最近活跃和累计会话；Codex 会读取 auth/config/session，展示登录方式、套餐、默认模型、推理默认、上下文窗口和 rate limit
- Provider 切换、默认 Provider 回退和未锁定会话自动纠偏时，会同步清空旧线程 ID、模型、推理强度和 Codex plan 激活态，并在已有消息的会话中追加系统事件，避免错误复用旧 Provider 上下文
- skills 扫描补充 `skills/.system` 目录，Provider 现在会同时识别用户级、项目级和系统级 skills

### 代码编辑器联动

- Runtime 新增代码编辑器探测、缓存和默认编辑器选择能力，并把当前选择写入本地配置；候选集覆盖 VS Code、Cursor、Windsurf、Zed、VSCodium、JetBrains 系列、Xcode、Nova、Sublime、BBEdit 等常见编辑器
- Git Diff 窗口新增“在编辑器中打开工作目录 / 当前文件”；主界面的工作区菜单也支持直接用编辑器打开项目
- Markdown 和消息中的本地路径链接不再只走系统默认打开，而是优先解析 `file://`、`:line:column`、`#LxCy` 等定位信息，并跳转到当前选中的代码编辑器

### Codex 会话控制 / Slash 命令

- 预加载层与运行时新增 `updateSessionReasoningEffort` IPC；Codex 会话支持保存 `low / medium / high / xhigh` 推理强度，并在启动参数里同时映射到 `model_reasoning_effort` 和 `plan_mode_reasoning_effort`
- Codex 的 `plan` 模式从单纯的权限模式值变成真实的会话切换：发送前会按需注入 `/plan`，运行成功后再把 `codexPlanModeActive` 回写到本地状态
- slash 命令改为按当前 Provider 动态生成和解析：Claude 会话提供 `/mode`，Codex 会话提供 `/reasoning`（兼容 `/effort`），两者共享 `/provider`、`/model`、`/mcp`、`/skills`、`/theme`
- 主会话和分屏会话都会继承当前上下文的 Provider；新增 `Cmd/Ctrl + T` 快捷键，用于在当前 pane 中轮换到下一个可用 Provider，必要时会先新建一个可切换的会话

### 前端设置 / 会话交互

- 设置弹窗扩展为 `App / Providers / Shortcuts / About` 四个标签页，新增代码编辑器选择、分屏大小限制忽略开关、应用版本/平台信息展示
- Provider 设置页新增手动刷新状态、Provider 开关和每个 Provider 的 system prompt 草稿/保存/重置能力；前端会把运行时返回的本地状态整理成卡片展示
- 会话 composer 进一步按 Provider 分化：Claude 保留模式选择，Codex 增加 Plan mode 开关与推理强度选择器；Provider / Mode / Reasoning / Model 菜单之间的互斥关闭逻辑也补齐
- 侧边栏和顶部 Provider 状态从简单可用性标记扩展为带版本/更新时间信息的状态提示；工作区菜单新增“用编辑器打开工作目录”

### 分屏 / 发送反馈 / 事件渲染

- 为每个 pane 新增 `pendingPaneTurns` 本地占位态：发送后会先把用户消息或 slash 命令事件临时插入对应 pane，等真实 session 状态更新后再自动清理，减少多分屏发送时的延迟感和闪烁
- `RunIndicator` 改为围绕“最后一个 outbound turn”判断，而不是只看普通用户消息；slash 命令、pending turn、pending approval、tool activity、thinking 状态都能更准确地控制运行指示
- 命令事件新增 `commandSource`（`slash / tool / system`），并贯穿事件追加、工具收尾、前端序列化和 UI badge 渲染；工具触发的命令事件不再和普通系统事件混在一起
- Git Diff 窗口补充编辑器打开入口；设置和确认弹窗改为支持滚动与 safe area 的布局

### 工程元数据 / 杂项

- 应用名称从 `CLI Proxy` 统一调整为 `CC Desktop Proxy`，同步更新了 `index.html` 标题、`package.json` 和打包配置中的 `productName`
- `package-lock.json` 有一轮锁文件刷新，主要体现为若干依赖的 `peer` 标记变化，没有独立的业务逻辑改动
- 当前工作区还包含两个未跟踪文件：`.DS_Store`、`approval-probe.txt`（内容为 `hello`），更像本地临时产物而不是产品功能变更

---

## 2026-03-20（当前工作区变更汇总）

### 运行时 / Provider

- 应用从单一 Claude CLI 扩展为 Claude / Codex 双 Provider 运行时：新增 provider 探测、版本/模型/skills 列表、默认 provider 推导，以及 `enabledProviders`、`paneLayout` 等 schema v6 持久化字段
- 会话支持在首次发言前切换 Provider；切换后会重置旧 Provider 的远端会话 ID、模型和权限模式，并在历史里写入命令事件。运行中或已有正式对话内容的会话会锁定 Provider，避免跨线程复用
- `sendMessage`、`/mcp`、skills 扫描与安装路径、CLI 可执行文件解析都改为按 Provider 路由；Claude 与 Codex 分别走各自的启动参数和能力检测流程
- 新增 IPC：`openWorkspaceInFinder`、`setPaneLayout`、`updateSessionProvider`、`setProviderEnabled`；`getGitDiffViewData`、`getSession`、`openGitDiffWindow` 继续作为 Git 变更窗口和分屏数据读取入口
- 运行态继续支持同窗口多会话并发，`runToken` 防竞态、`resetRunState` / `deleteRunState` 收口了进程结束后的状态清理

### 前端 / 分屏与侧边栏

- 多分屏布局进一步完善：支持 `single / columns / rows / grid`，布局和最近使用的 pane 顺序同时持久化到本地与 Electron store；窗口空间不足时，超出的 pane 会进入“隐藏分屏”区
- Composer 和会话元信息改为感知当前 Provider：模型选择跟随聚焦会话的 Provider，可用模型和技能列表也按 Provider 动态切换；新增 `/provider` 指令和 Provider 锁定提示
- 设置页新增 Provider 开关区，允许控制哪些本地 CLI 可用于新会话和未锁定会话，并强制至少保留一个启用项；侧边栏和顶部同时展示 Provider 可用状态
- 侧边栏新增展开/折叠、悬浮面板、隐藏分屏入口、快捷键提示，以及工作区“更多操作”菜单；工作区现在可以直接“查看 Git 变更”或“在 Finder 中打开工作目录”
- `focusedPane` / `focusedSession` / `focusedWorkspace`、`sessionViewCache`、`sendingPaneIds` 等状态继续支撑多分屏独立发送和会话切换

### Git 变更窗口 / UI 收尾

- Git 变更窗口补充了头部增删行汇总，并把错误展示从内联 banner 改成 toast；主界面也抽出通用 `ToastViewport` 组件复用
- `ScrollArea` 新增 `viewportClassName`，便于局部定制滚动容器；`index.css` 增加 pane focus 色板，并增强 Markdown、行内代码、长路径的自动换行能力，减少内容撑破布局的问题
- 工作区序列化新增 `gitAddedLines`、`gitDeletedLines`、`gitDirty` 字段，Git 信息缓存 TTL 延长到 10 秒；Git 变更视图继续支持 tracked / untracked 文件、patch、状态标签和增删行统计
- 页面标题和应用文案向 `CLI Proxy` 统一，`index.html` 标题改为 `CLI Proxy Workspace`

### 打包 / 发布

- `package.json` 新增 `productName`、应用描述和 `electron-builder` 配置，接入 macOS `dmg` 打包、`asar`、`hardenedRuntime`、entitlements、图标和 notarization 相关参数
- 新增 `build:icon`、`dist:mac`、`dist:mac:dir`、`release:mac`、`release:mac:check` 脚本；`package-lock.json` 同步引入 `electron-builder` 及相关依赖
- 新增 `scripts/build-mac-icon.mjs`，基于 `qlmanage`、`sips`、`iconutil` 从 `build/icon.svg` 生成 `icon.png` 和 `icon.icns`
- 新增 `scripts/release-mac.mjs`、`.env.release.example`、`build_release_info.md`，用于校验签名 / 公证环境、说明打包流程和维护发布所需变量
- 新增 `build/` 下的图标与 entitlements 资源，并在 `.gitignore` 中补充忽略 `release/`、`build/generated/` 和 `.env.release.local`

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
