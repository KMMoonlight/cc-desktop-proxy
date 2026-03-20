# Changelog

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
